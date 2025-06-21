import Response from "../services/response";
import GraphApi from "../services/graph-api";
import i18n from "../i18n.config";
import config from "../services/config";
import { OpenAI } from "openai";
import { ChatOpenAI, messageToOpenAIRole } from "@langchain/openai";
import { AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";

import Thread from "../models/Thread";
import Message from "../models/Message";

import { scrapeFromAZLyrics, scrapeMiraikyun } from "../services/no need for now/scrapeLyrics";

import dotenv from "dotenv";
import { stringify } from "querystring";
import e from "express";
import { time } from "console";
import { raw } from "body-parser";
dotenv.config();

const model = new ChatOpenAI({
  model: "gpt-4.1",
  openAIApiKey : process.env.OPEN_API_KEY
});

const tavilyTool = new TavilySearch({
  maxResults: 5
})


type WebhookEvent = any; // You can define a more specific type for your webhook events
type User = any; // Define your User type/interface as needed

export default class Receive {
  user: User;
  webhookEvent: WebhookEvent;
  isUserRef: boolean;

  constructor(user: User, webhookEvent: WebhookEvent, isUserRef: boolean) {
    this.user = user;
    this.webhookEvent = webhookEvent;
    this.isUserRef = isUserRef;
  }

  // Check if the event is a message or postback and call the appropriate handler function
  async handleMessage(): Promise<void> {
    const event = this.webhookEvent;
    let responses: any;

    // if this.WebhookEvent is a reaction event, ignore it
    if (event.reaction !== undefined) {
      console.log("Ignore reaction event");
      return;
    }

    try {
      if (event.message) {
        console.log("Start handleTextMessage:");
        console.log("User:", this.user);
        console.log("WebhookEvent:", this.webhookEvent);
        console.log("isUserRef:", this.isUserRef);
        responses = await this.handleTextMessage();
      }
    } catch (error) {
      console.error(error);
      responses = {
        text: `An error has occured: '${error}'. We have been notified and will fix the issue shortly!`
      };
    }

    // If there are multiple messages to respond to user, delay 2s between each message
    if (Array.isArray(responses)) {
      let delay = 0;
      for (const response of responses) {
        this.sendMessage(response.responseText, delay * 2000, this.isUserRef, response.threadId);
        delay++;
        // save the response to the database
           }
    } else {
      this.sendMessage(responses.responseText, 1, this.isUserRef, responses.threadId);
      // save the response to the database
      
    }

    // Check if the user wants to close the lesson
    if (responses.closeLesson) {
      try { 
        await Thread.findByIdAndUpdate(responses.threadId, {
          status: "closed"
        });
        console.log("Thread closed:", responses.threadId);
      } catch (error) {
        console.error("Error closing thread:", error);
      }
    }


  }

  // Handles messages events with text
  async handleTextMessage(): Promise<{responseText: string, threadId: string, closeLesson: boolean }> {
    
    let closeLesson = false;
    let context = {} as any;

    console.log(
      "Received text:",
      `${this.webhookEvent.message.text} for ${this.user.psid}`
    );

    const userMessage = this.webhookEvent.message.text ?? "";

    // Save thread and message to the database
    let existingThread : any;
    existingThread = await Thread.findOne({
      userId: this.user.psid,
      status: "open"
    });

    if (!existingThread) {
      try {
        const newThread = await Thread.create({
          userId: this.user.psid,
          status: "open",
          startTime: new Date()
        });
        console.log("New thread created:", newThread);
        existingThread = newThread;
      } catch (error) {
        console.error("Error creating new thread:", error);
      };
    }

    let newMessage : any;
    try {
      newMessage = await Message.create({
        threadId: existingThread._id,
        sender: "user",
        userId: this.user.userId,
        text: userMessage,
        timestamp: new Date()
      });
      console.log("New message created:", newMessage);
    } catch (error) {
      console.error("Error creating new message:", error);
    };

    let responseText : string = "";

    // if user wants to close the current lesson, send a closure message and update the thread
    const closeLessonKeywords = ["close lesson", "start new lesson", "finish lesson"];
    if (closeLessonKeywords.some(keyword => userMessage.toLowerCase().includes(keyword))) {
      console.log("User want to close the lesson");
      responseText = "Yes, I will close the lesson and update your progress (lesson history and vocabulary) in the system. You can start a new lesson anytime by sending me a message.";
      closeLesson = true;
      return {responseText, threadId: existingThread._id, closeLesson: closeLesson};
    };

    // Decide whether to call searchTool
    let searchResult: String;
    searchResult = "";
    const last3Message = await Message.find({
      threadId: existingThread._id
    })
      .sort({ timestamp: -1 })
      .limit(3)
      .exec();

    const last3MessageText = last3Message
    .reverse()
    .map((message) => `At ${message.timestamp} from ${message.sender}: ${message.text}`)
    .join("\n");
    console.log("Last 3 messages:", last3MessageText);

    const decideSearchSchema = z.object({
      callSearch: z.boolean().describe("whether to call searchTool to search for the song lyrics"),
      query: z.string().describe("the query to search for the song lyrics, including the song name and artist, if it is Japanese song, also ask for romanji"),
      songName: z.string().describe("the name of the song"),
      artist: z.string().describe("the name of the artist")
    });

    // Call AI to decide whether to call searchTool
    const decideSearchPrompt = `
    You read the context and the last 3 messages of the conversation and decide whether to call searchTool to search for the song lyrics. Scenarios:
    - User ask for the song 
    - Bot suggest a new song
    - Bot provides the wrong lyrics and user ask for the correct ones

    DONT CALL searchTool if user already provided the lyrics.
    
    current conversation topic is: (${existingThread.topic ?? "not yet defined"})
    current material is: (${existingThread.material ?? "not yet defined"})

    3 last messages:
    ${last3MessageText}

    If you decide to call Search, specify the query, songName, artist too. 
    Example #1
    current conversation topic is: (not yet defined})
    current material is: (not yet defined)
    3 last message:
    today i want to learn the song yasashii suisei by Yoasobi 
    
    Your output will be:
    {
      "callSearch": true,
      "query": "Full lyrics of the song Yasashii Suisei, by YOASOBI, prefer both Romanji and Kanji",
      "songName": "yasashii suisei",
      "artist": "Yoasobi"
    }

    Example #2
    current conversation topic is: Yasashii Suisei by Yoasobi
    current material is: 
    今、静かな夜の中で
    ima, shizuka na yoru no naka de

    無計画に車を走らせた
    mukeikaku ni kuruma wo hashiraseta

    左隣、あなたの
    hidaritomari, anata no

    横顔を月が照らした
    yokogao wo tsuki ga terashita

    3 last message:
    yes please continue with next lines
    
    Your output will be:
    {
      "callSearch": false,
      "query": "",
      "songName": "yasashii suisei",
      "artist": "Yoasobi"
    }
    `

    
    console.log(`check callSearchPrompt: \n ${decideSearchPrompt}`);


    try {
      const callSearchDecision = await model.withStructuredOutput(decideSearchSchema).invoke( [ new SystemMessage(decideSearchPrompt) ]);

      console.log("callSearchText: ", callSearchDecision);
      if (callSearchDecision.callSearch) {
        console.log("call searchTool");
        
        //update the topic with the callSearchDecision
        try {
          await Thread.findByIdAndUpdate(existingThread._id, {
            topic: 'callSearchDecision.songName + " by " + callSearchDecision.artist'
          });
        } catch (error) {
          console.error("Error updating thread topic:", error);
        }
        
        const rawSearchResult = await tavilyTool.invoke({query: callSearchDecision.query});
        searchResult = JSON.stringify(rawSearchResult, null, 3);
        console.log("search result", searchResult);

        // find the search result that contain an url from AZLyrics or Miraikyun. Otherwise, inform the user cannot search and ask them to provide the lyrics instead.
        let lyricsUrl = "";
        let scrapedLyrics = "" as string;
        for (const result of rawSearchResult.results) {
          if (result.url && (result.url.includes("azlyrics.com") || result.url.includes("miraikyun.com"))) {
            lyricsUrl = result.url;
            break;
          }
        }
        
        // Scrape the lyrics from the url
        if (lyricsUrl === "") {
          console.log("Cannot find lyrics url from search result, ask user to provide lyrics");
          responseText = `I cannot get the lyrics for the song you requested. Please let me know the lyrics instead`;
          return {responseText, threadId: existingThread._id, closeLesson: closeLesson};;
        } else {
          if (lyricsUrl.includes("azlyrics.com")) {
            console.log("Scrape lyrics from AZLyrics");
            const result = await scrapeFromAZLyrics(lyricsUrl);
            if (result.error) {
              responseText = `I cannot get the lyrics for the song you requested. Please let me know the lyrics instead.`;
            } else {
              scrapedLyrics = result.lyrics;
              // Update existingThread.material with the scraped lyrics
              try {
                await Thread.findByIdAndUpdate(existingThread._id, {
                material: scrapedLyrics
              });
              }
              catch (error) {
                console.error("Error updating thread material:", error);
              }

              console.log("Scraped lyrics from AZLyrics: ", scrapedLyrics);
              const displayLyrics = scrapedLyrics.slice(0, 500); // Limit to 500 characters for display
              responseText = `I found the lyrics for the song you requested, let me know if it is the right song!. Here is the lyrics:\n\n${displayLyrics}`;
            }
          } else {
            console.log("Scrape lyrics from Miraikyun");
            const result = await scrapeMiraikyun(lyricsUrl);
            if (result.error) {
              responseText = `I cannot get the lyrics for the song you requested. Please let me know the lyrics instead.`;
            } else {
              scrapedLyrics = result.lyrics;

              // Update existingThread.material with the scraped lyrics
              try {
                await Thread.findByIdAndUpdate(existingThread._id, {
                material: scrapedLyrics
              });
              }
              catch (error) {
                console.error("Error updating thread material:", error);
              }

              console.log("Scraped lyrics from Miraikyun: ", scrapedLyrics);
              const displayLyrics = scrapedLyrics.slice(0, 500); // Limit to 500 characters for display
              responseText = `I found the lyrics for the song you requested, let me know if it is the right song!. Here is the lyrics:\n\n${displayLyrics}`;
            }
          }
        }
        
        // return the response with the scraped lyrics
        return {responseText, threadId: existingThread._id, closeLesson: closeLesson};
        
      }
    } catch (error) {
      console.error("Error deciding whether to call searchTool:", error);
    }
    


    
    // Retrieve the lastest 50 messages from the thread
    const lastMessages = await Message.find({
      threadId: existingThread._id
    })
      .sort({ timestamp: -1 })
      .limit(50)
      .exec();
    // Reverse the order of messages to get the conversation history
    const chatHistory = lastMessages
      .reverse()
      .map((message) => `At ${message.timestamp} from ${message.sender}: ${message.text}`)
      .join("\n");
    console.log("Chat history:", chatHistory);



      
    // Call AI to get the response
    const instruction = `
    # OVERVIEW
    You are a language tutors through songs. You guide your student to learn their favorite songs while learning foreign language (focus on listening and speaking). You respond to student's chat message with the instruction, their message, their chat history and context (if any).
    Your response MUST BE WITHIN 150 WORDS (max 2000 characters).
    
    # TASK DESCRIPTION
    There are 2 tasks: GUIDE NEW LESSON and HELP PRACTICE.
    
    ## GUIDE NEW LESSON
    You take the lyrics of the song, break it down to paragraph, line by line, explain the vocabulary and grammar and the combined meaning of each line. The output will look like this. 
    Romanji:
    Kowakute shikata nai kedo
    Translation:
    "I'm so scared I can't help it, but..."
    Breakdown:
    kowai (怖い) = scary, afraid
    ~kute (〜くて) = te-form of kowai (to connect to next phrase)
    shikata (仕方) = way, means, method
    nai (ない) = not exist, none → shikata nai = "no way (to deal with it)" → "can't help it"
    kedo (けど) = but, although
    Combined meaning:
    "Though I can’t help being scared" 
    
    ## HELP PRACTICE 
    You give the quiz to the student to practice the vocabulary and grammar. The quiz can be multiple choice or open question.
    You give one quiz at a time, and wait for the student's response before moving to the next one.
    `;
    const userId = this.user.psid;

    const prompt = `${instruction} \n\n Current context is: \n\n ${JSON.stringify(context)} \n\n Current coversation is: ${chatHistory}`;
    console.log("$$$$$$ PROMPT: ", prompt);   
    const response = await model.invoke([new SystemMessage(prompt)]);
    // Normalize response.content to always be a string
  if (typeof response.content === "string") {
    responseText = response.content;
  } else if (Array.isArray(response.content)) {
    responseText = response.content.map((part: any) => part.text ?? "").join("");
  } else {
    responseText = String(response.content ?? response.text ?? response);
  }

    console.log("Model response: ", responseText);
    return {responseText, threadId: existingThread._id, closeLesson: closeLesson};
  }

  // Handles message events with attachments
  handleAttachmentMessage(): void {
    // Get the attachment
    const attachment = this.webhookEvent.message.attachments[0];
    console.log("Received attachment:", `${attachment} for ${this.user.psid}`);
    console.log("Not handle attachment yet");
  }

  // Handles message events with quick replies
  handleQuickReply(): any {
    // Get the payload of the quick reply
    const payload = this.webhookEvent.message.quick_reply.payload;
    return this.handlePayload(payload);
  }

  // Handles postbacks events
  handlePostback(): any {
    const postback = this.webhookEvent.postback;
    // Check for the special Get Started with referral
    let payload;
    if (postback.referral && postback.referral.type === "OPEN_THREAD") {
      payload = postback.referral.ref;
    } else if (postback.payload) {
      // Get the payload of the postback
      payload = postback.payload;
    }
    if (payload && payload.trim().length === 0) {
      console.log("Ignore postback with empty payload");
      return null;
    }
    return this.handlePayload(payload.toUpperCase());
  }


  handlePayload(payload: string): void {
    console.log("Received Payload:", `${payload} for ${this.user.psid}`);
    console.log("Not handle payload yet");
  }

  

  sendMessage(response: any, delay = 0, isUserRef: boolean, threadId: String): void {
    // Check if there is delay in the response
    if (response === undefined || response === null) {
      return ;
    }
    // i dont understand this code yet it created issue
    // if ("delay" in response) {
    //   delay = response["delay"];
    //   delete response["delay"];
    // }
    // Construct the message body
      // Wrap string responses as { text: ... }
    const messagePayload = typeof response === "string" ? { text: response } : response;

    let requestBody: any = {};
    if (isUserRef) {
      // For chat plugin
      requestBody = {
        recipient: {
          user_ref: this.user.psid
        },
        message: messagePayload
      };
    } else {
      requestBody = {
        recipient: {
          id: this.user.psid
        },
        message: messagePayload
      };
    }

    // Troubleshoot requestBody
    console.log("sendMessage Request body:", requestBody);

    setTimeout(() => { 
      (async() => {
        try { 
          const sent = await GraphApi.callSendApi(requestBody);
          console.log("Message sent:", sent);
          if (sent) {
            await Message.create({
            threadId: threadId,
            sender: "bot",
            timestamp: new Date(),
            text: response
          });
          console.log("New bot message saved to db");
          };
          
        } catch (error) {
          console.error("Error creating new message:", error);
        }
      })();
    }, delay);
  }

  sendRecurringMessage(notificationMessageToken: string, delay: number): void {
    console.log("Received Recurring Message token");
    console.log("Not handle recurring message yet");
  }

  firstEntity(nlp: any, name: string): void {
    console.log("Not handle first entity yet");
  }

  handleReportLeadSubmittedEvent(): void {
    console.log("Not handle report lead submitted event yet");
  }
}
