import GraphApi from "./graph-api";

import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, AIMessage, ToolMessage, BaseMessage, isToolMessage, mapStoredMessageToChatMessage } from "@langchain/core/messages";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";
import { tool } from "@langchain/core/tools";

import Thread from "../models/Thread";
import Message from "../models/Message";
import UserVocab from "../models/UserVocab";

import { mainInstruction, extractWordsInstruction, closeLessonInstruction } from "./instruction";

import { scrapeFromAZLyrics, scrapeMiraikyun } from "./scrapeLyrics";

import dotenv from "dotenv";
import { request } from "express";
import { raw } from "body-parser";
import { threadId } from "worker_threads";
dotenv.config();

const model = new ChatOpenAI({
    model: "gpt-4.1",
});



const tavilyTool = new TavilySearch({ maxResults: 5 });

const fetchLyricsSchema = z.object({
    artist: z.string().describe("Artist of the song to fetch lyrics for"),
    title: z.string().describe("Title of the song to fetch lyrics for"),
    query: z.string().describe("Query to search for lyrics. You need to also specify preferrably from azlyrics or miraikyun. For example 'Full lyrics of Tsubame by Yoasobi, preferrably from azlyrics.com or miraikyun.com'"),
});

const fetchLyrics = tool(
    async ({ artist, title, query }: { artist: string, title: string, query: string }) => {

        // First search for the url link of the lyrics
        try {
            const searchResult = await tavilyTool.invoke({ query: query });
            console.log("Search result:", searchResult);

            // check if url is from site that we can scrape lyrics
            for (const result of searchResult.results) {
                if (result.url.includes("azlyrics.com")) {
                    const lyrics = await scrapeFromAZLyrics(result.url);
                    if (lyrics) {                        
                        return { lyrics: lyrics.lyrics };
                    }
                }
                if (result.url.includes("miraikyun.com")) {
                    const lyrics = await scrapeMiraikyun(result.url);
                    if (lyrics) {
                        return { lyrics: lyrics.lyrics };
                    }
                }
            }

        } catch (error) {
            console.error("Error fetching lyrics:", error);
        }
        return { lyrics: "" };
    },
    {
        name: "fetchLyrics",
        description: "Fetch lyrics of a song by a query",
        schema: fetchLyricsSchema,
    }

)

const updateThreadMaterialSchema = z.object({
    material: z.string().describe("Lyrics material to update the thread with"),
    artist: z.string().describe("Artist of the song"),
    title: z.string().describe("Title of the song"),
    threadid: z.string().describe("ID of the thread to update"),
});

const updateThreadMaterial = tool(
    async ({material, artist, title, threadId}: { material: string, artist: string, title: string, threadId: string }) => {
        try {
            // Update the thread's material and topic (with artist and title)
            const updatedThread = await Thread.findByIdAndUpdate(threadId, {
                material: material,
                topic: `${artist} - ${title}`,
            }, { new: true });
            console.log("Thread updated with material:", updatedThread);
            return { success: true, message: "Thread material updated successfully." };
        } catch (error) {
            console.error("Error updating thread material:", error);
            return { success: false, message: "Failed to update thread material." };
        }
    },
    {
        name: "updateThreadMaterial",
        description: "Update the thread's material with lyrics and topic with artist and title",
        schema: updateThreadMaterialSchema,
    }
);
            
// Bind the tool to the model
const tools = [fetchLyrics, updateThreadMaterial];

const modelWithTool = model.bindTools([fetchLyrics]);

type WebhookEvent = any;
type User = any;

export default class Receive {

    user: User; //this is the whole user object
    webhookEvent: WebhookEvent;
    isUserRef: boolean;

    constructor(user: User, webhookEvent: WebhookEvent, isUserRef: boolean) {
        this.user = user;
        this.webhookEvent = webhookEvent;
        this.isUserRef = isUserRef;
    }

    async getThread(psid: string): Promise<any> {
        let thread = await Thread.findOne({ psid: this.user.psid, status: "open" });
        if (!thread) {
            thread = await Thread.create({ psid: this.user.psid, status: "open", startTime: new Date() });
            console.log("New thread created:", thread);
        } else {
            console.log("Existing thread found:", thread);
        }
        return thread;
    }

    async saveUserMessage(threadId: string, psid: string, text: string) {
        try {
            const message = await Message.create({
                threadId,
                sender: "user",
                psid,
                text
            });
            console.log("User message saved:", message.text);
            return message;
        } catch (error) {
            console.error("Error saving user message:", error);
        }
    }

    async saveBotMessage(threadId: string, text: string) {
        try {
            const message = await Message.create({
                threadId,
                sender: "bot",
                text
            });
            console.log("Bot message saved:", message.text);
            return message;
        } catch (error) {
            console.error("Error saving bot message:", error);
        }
    }

    async getChatHistory(threadId: string) {
        const rawData = await Message.find({ threadId })
            .sort({ timestamp: -1 })
            .limit(20)
            .exec();

        const chatHistory = rawData
            .reverse()
            .map((message) => `At ${message.timestamp} from ${message.sender} : ${message.text}`)
            .join("\n");

        return chatHistory;
    }

    async extractWordsFromMaterial(material: string): Promise<string[]> {
        
        // Use the extractWordsInstruction to extract words from the material. the output of the AI is already an array of words.
        const outputSchema = z.object({
            words: z.array(z.string()).describe("list of word extracted"),
        })
        
        try { 
            const response = await model.withStructuredOutput(outputSchema).invoke([new SystemMessage(extractWordsInstruction), new AIMessage(material)]);
            console.log("Extracted words response:", response);
            if ("words" in response) {
                return response.words;
            }
        } catch (error) {
            console.error("Error extracting words from material:", error);

        }
        return [];
    }

    
    async getUserVocab(wordList: string[], userId: string): Promise<any> {
        
        // find the words in UserVocab that match the wordlist provided
        const response = await UserVocab.find({
            userId, word: { $in: wordList}
        });
        console.log('Result found: ', response)
        
        const known = []
        const introduced = []
        for (const item of response) {
            if (item.status === "known") {
                known.push(item.word)
            } 
            if (item.status === "introduced") {
                introduced.push(item.word)
            }
        }

        const knownString = known.length > 0 ? known.join(","): "none";
        const introducedString = introduced.length > 0 ? introduced.join(",") : "none";

        return `
        Known words: ${knownString}
        Introduced words: ${introducedString}`
        
    }

    async processWithToolCall(currentMessages: BaseMessage[], threadId: string) : Promise<BaseMessage[]> {
            const response = await modelWithTool.invoke(currentMessages);
            console.log("Response message:", response);

            if (response.tool_calls?.length) {
                const toolMessages: BaseMessage[] = [response];
                console.log("Tool message at start of processWithToolCase", JSON.stringify(toolMessages, null, 2));

                // Process each tool call
                for (const toolCall of response.tool_calls) {
                    if (toolCall.name === "fetchLyrics") {
                        const result = await fetchLyrics.invoke(toolCall.args);
                        
                        // Save the lyrics to the thread's material
                        if (result.lyrics) {
                            try {
                                await Thread.findByIdAndUpdate(threadId, { material: result.lyrics });
                                console.log("Thread material updated with lyrics");
                            } catch (error) {
                                console.error("Error updating thread material:", error);
                            }
                        }

                        // Retrieve the userVocab and update to Thread
                        const wordList = await this.extractWordsFromMaterial(result.lyrics);
                        const userVocab = await this.getUserVocab(wordList, this.user._id);
                        try {
                            await Thread.findByIdAndUpdate(
                            threadId, {userVocab: userVocab});

                            console.log('Update Thread.userVocab successfully');
                        } catch (error) {
                            console.log('Fail to update Thread.userVocab ', error);
                        }

                        // Craft tool response
                        const toolMessage = new ToolMessage({
                            content: `
                            ${result.lyrics}/n
                            The words user has known/introduced are:
                            ${userVocab}
                            `,
                            name: toolCall.name,
                            tool_call_id: toolCall.id!,
                        });
                        console.log("Tool result:", toolMessage.content)

                        // Append result to the messages
                        toolMessages.push(toolMessage);
                        console.log("Tool message after processing fetchLyrics", JSON.stringify(toolMessages, null, 2));
                    } else if (toolCall.name === "updateThreadMaterial") {
                        const result = await updateThreadMaterial.invoke(toolCall.args);
                        const toolMessage = new ToolMessage({
                            content: result.success,
                            name: toolCall.name,
                            tool_call_id: toolCall.id!,
                        });
                        console.log("Tool result:", toolMessage);

                        // Append result to the messages
                        toolMessages.push(toolMessage);
                        console.log("Tool message after processing updateThreadMaterial", JSON.stringify(toolMessages, null, 2));
                    }      
                }
                // Recursively process the tool calls
                return this.processWithToolCall([ ...currentMessages, ...toolMessages ], threadId);
            }

            // Return the response messages if no tool calls are present
            return [...currentMessages, response];

        }

    async closeThread(threadId: string, vocabBeforeLesson: string) : Promise<void> {
        const userId = this.user._id;
        
        try {
        // // Send message and update status = close
        // await this.sendMessage(
        //     "Yes, I will close the lesson and update your progress (lesson history and vocabulary) in the system. You can start a new lesson anytime by sending me a message.",
        //     threadId
        // );
        console.log('NOT CLOSE THREAD YET FOR TESTING PURPOSE');
        // await Thread.findByIdAndUpdate(threadId, {status : "closed"});
        // console.log('status updated as closed');

        // get threadMessage
        const rawThreadMessages = await Message.find({threadId});
        const threadMessages = rawThreadMessages
        .map((message) => `At ${message.timestamp} from ${message.sender} : ${message.text}`)
        .join("\n");
        console.log('done preparing data');

        // invoke model to decide how to update userVocab
        const vocabSchema = z.object({
            userId: z.string().describe('_id of the user'),
            word : z.string().describe('the word to learn'),
            note: z.string().describe('note for the word: for japanese/chinese/korean, note its romanji'),
            meaning: z.string().describe('meaning of the word in the language of the learner'),
            status: z.enum(["introduced", "known"]).describe('status of the word'),
            language: z.enum(["English", "Chinese", "Japanese", "Korean",  "French", "Italian"]).describe('language of the word')
        });

        const vocabArraySchema = z.object({
            vocabs: z.array(vocabSchema).describe('list of words to update to user vocab')
        });

        const prompt = `
        ${closeLessonInstruction}

        UserId is: ${userId}

        Vocab before thread: ${vocabBeforeLesson}

        Chat thread:
        ${threadMessages}
        `
        const result = await model.withStructuredOutput(vocabArraySchema).invoke(prompt);
        console.log('Response from AI to update userVocab ', result);
        // update to UserVocab
        for (const item of result.vocabs) {
            await UserVocab.updateOne(
                { userId, word: item.word },
                {
                    $set: {
                        status: item.status,
                        note : item.note || "",
                        meaning: item.meaning,
                        language: item.language
                    }
                },
                { upsert: true}
            )

        }


        //
        } catch (error) {
        console.log("Something went wrong", error);
        }
        
    }
    


    async handleMessage(): Promise<void> {
        const event = this.webhookEvent;
        let response: any;

        // Ignore if event is a reaction
        if (event.reaction) {
            console.log("Reaction event ignored");
            return;
        }

        try {
            if (event.message) {
                console.log("Start handle text message");
                console.log("User: ", this.user);
                console.log("Event: ", event);
                console.log("Is user ref: ", this.isUserRef);

                response = await this.handleTextMessage();
            }
        } catch (error) {
            console.error("Error handling message:", error);
            response.message = "Sorry, I encountered an error while processing your request.";

        }

        // handle close message
        if (response.closeLesson) {
            const thread = await Thread.findById(response.threadId);
            try {
                await this.closeThread(response.threadId, "" );
                console.log("Thread closed successfully");

            } catch (error) {
                console.error("Error closing thread:", error);
                response.message = "Sorry, I encountered an error while closing the lesson.";
            }
        }

        // respond to user
        this.sendMessage(response.message, response.threadId);

    }

    


    async handleTextMessage(): Promise<{ message: string, threadId: string, closeLesson: boolean }> {

        const thread = await this.getThread(this.user.psid);
        await this.saveUserMessage(thread._id, this.user.psid, this.webhookEvent.message.text);
        const chatHistory = await this.getChatHistory(thread._id);


        // Check if the user wants to close the lesson

        const closeLessonKeywords = ["close lesson", "end lesson", "finish lesson", "stop lesson"];
        if (closeLessonKeywords.some(keyword => this.webhookEvent.message.text.toLowerCase().includes(keyword))) {
            console.log("USER WANTS TO CLOSE LESSON");
            return {
                message: "Yes, I will close the lesson and update your progress (lesson history and vocabulary) in the system. You can start a new lesson anytime by sending me a message.",
                threadId: thread._id,
                closeLesson: true
            };
        }

        // Call the model to get a response
        let prompt = `
        ${mainInstruction}
        
        ## Context of current lesson:
        ${thread.material || "No lyrics material available"}

        ## Word list that user has known or introduced in other song but not yet familiar
        ${thread.userVocab || "(No information)"}

        ## Current conversation:
        ${chatHistory}
        
        Define the response to user (within 2000 characters only), using the tools available if necessary. 
        `;
        console.log('PROMPT IS: ', prompt);

        const messages = [ 
            new SystemMessage(prompt)
        ];

        // recursive tool calling handling
        
        
        // Use the recursive function to process tool calls
        const allMessages = await this.processWithToolCall(messages, thread._id);
        // set outputMessage to the property content of the last message in allMessages
        console.log("ALLMESSAGES AFTER PROCESSWITHCALLTOOLS", JSON.stringify(allMessages, null, 2));
        const outputMessage = allMessages[allMessages.length - 1].content || "Sorry, something went wrong. I couldn't process your request.";        


        return {
            message: outputMessage,
            threadId: thread._id,
            closeLesson: false}


        // while (true) {
        //     try {
        //         const response = await modelWithTool.invoke([new SystemMessage(prompt)]);
        //         console.log("Response message:", response);
        //         if (response instanceof AIMessage && response.tool_calls?.length) {
        //             for (const toolCall of response.tool_calls) {
        //                 const toolName = toolCall.name;
        //                 const toolArgs = toolCall.args;
        //                 const toolCallId = toolCall.id;
        //                 console.log("Tool call detected:", toolName, toolArgs, toolCallId);

        //                 // find and execute the tool
        //                 const tool = tools.find(t => t.name === toolName);
        //                 if (tool) {
        //                     const result = await tool.invoke(toolArgs);
        //                     console.log("Tool result:", result);

        //                     // Append result to the ToolMessage
        //                     prompt = prompt + `\n\n## Tool result: You have called tool ${toolName} and got the result as \n ${JSON.stringify(result)}`;
        //                 }

        //             }

        //         } else {
        //             return { message: response.content, threadId: thread._id, closeLesson: false };
        //         }
        //     } catch (error) {
        //         console.error("Error invoking model:", error);
        //         return { message: "", threadId: "", closeLesson: false };
        //     }
        // }
        
    }

    async sendMessage(message: string, threadId: string): Promise<void> {

        const requestBody = {
            recipient: { id: this.user.psid },
            message: { text: message },
        };
        try {
            const sent = await GraphApi.callSendApi(requestBody);
            if (sent) {
                console.log("Message sent successfully");
                await Message.create({
                    threadId,
                    text: message,
                    sender: "bot",
                })
            }
        } catch (error) {
            console.error("Error sending message:", error);
        }
    }



}


