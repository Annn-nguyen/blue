import GraphApi from "./graph-api";

import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, AIMessage, ToolMessage, BaseMessage, isToolMessage, mapStoredMessageToChatMessage } from "@langchain/core/messages";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";
import { tool } from "@langchain/core/tools";

import Thread from "../models/Thread";
import Message from "../models/Message";
import UserVocab from "../models/UserVocab";
import Song from "../models/Song";
import Reminder from "../models/Reminder";

import { mainInstruction, extractWordsInstruction, closeLessonInstruction } from "./instruction";
import { reviewLesson } from "../z.Old/reviewLesson";
import { fetchLyrics, scrapeFromAZlyrics, scrapeFromMiraikyun } from "../utilities/fetchLyrics";

import dotenv from "dotenv";
import { request } from "express";
import { raw } from "body-parser";
import { threadId } from "worker_threads";
import { timeStamp } from "console";
import { readSync } from "fs";
dotenv.config();

const model = new ChatOpenAI({
    model: "gpt-4.1-mini",
});



const tavilyTool = new TavilySearch({ maxResults: 5 });

const fetchLyricsSchema = z.object({
    artist: z.string().describe("Artist of the song to fetch lyrics for"),
    title: z.string().describe("Title of the song to fetch lyrics for"),
    searchKeywords: z.string().describe('this include all the search keywords that can be used to search for this song, you can translate the english name to the song language to search. For example if user search for probably song by yoasobi, search keywords will be (probably, tabun, たぶん)'),
    language: z.string().describe("Language of the song, must be in the list: English, Chinese, Japanese, Korean, French, Italian, Other"),
});

const fetchLyricsTool = tool(
    async ({ artist, title, searchKeywords, language }: { artist: string, title: string, searchKeywords: string, language: string }) => {

        // First search for the url link of the lyrics
        let lyrics = 'No result';
        try {
            const result = await fetchLyrics(title, artist, searchKeywords, language);
            lyrics = result;

        } catch (error) {
            console.error("Error fetching lyrics:", error);
        }
        return lyrics;
    },
    {
        name: "fetchLyricsTool",
        description: "Fetch lyrics of a song by a query",
        schema: fetchLyricsSchema,
    }

)

const updateLyricsFromUserInputSchema = z.object({
    material: z.string().describe("Lyrics material to update the thread with"),
    artist: z.string().describe("Artist of the song"),
    title: z.string().describe("Title of the song"),
});

const updateLyricsFromUserInput = tool(
    async ({ material, artist, title, language }: { material: string, artist: string, title: string, language: string }) => {
        try {

            // update the song in catalog to get the latest lyrics too 
            const updatedSong = await Song.findOneAndUpdate(
                { title: title, artist: artist },
                {
                    $set: {
                        lyrics: material,
                        language: language,
                    }
                },
                { upsert: true, new: true }
            );
            console.log('upsert to catalog with song ', title, ' by ', artist);

            return true;
        } catch (error) {
            console.error("Error updating thread material:", error);
            return false;
        }
    },
    {
        name: "updateLyricsFromUserInput",
        description: "Update the thread's material with lyrics and topic with artist and title directly from the input of user",
        schema: updateLyricsFromUserInputSchema,
    }
);

// Bind the tool to the model
const tools = [fetchLyricsTool, updateLyricsFromUserInput];

const modelWithTool = model.bindTools(tools);

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
            userId, word: { $in: wordList }
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

        const knownString = known.length > 0 ? known.join(",") : "none";
        const introducedString = introduced.length > 0 ? introduced.join(",") : "none";

        return `
        Known words: ${knownString}
        Introduced words: ${introducedString}`

    }

    async processWithToolCall(currentMessages: BaseMessage[], threadId: string): Promise<BaseMessage[]> {
        const response = await modelWithTool.invoke(currentMessages);
        console.log("Response message:", response);

        if (response.tool_calls?.length) {
            const toolMessages: BaseMessage[] = [response];
            console.log("Tool message at start of processWithToolCase", JSON.stringify(toolMessages, null, 2));

            // Process each tool call
            for (const toolCall of response.tool_calls) {
                if (toolCall.name === "fetchLyricsTool") {
                    // handle the case we can fetch lyrics from catalog/online source
                    const result = await fetchLyricsTool.invoke({
                        artist: toolCall.args.artist,
                        title: toolCall.args.title,
                        searchKeywords: toolCall.args.searchKeywords,
                        language: toolCall.args.language,
                    });

                    let toolResult = 'No lyrics found';
                    
                    if (result !== 'No result') {
                        // Retrieve the userVocab and update to Thread
                        const wordList = await this.extractWordsFromMaterial(result);
                        const userVocab = await this.getUserVocab(wordList, this.user._id);
                        
                        // Craft the toolResult
                        toolResult = `
                        ${result}/n
                        The words user has known/introduced are:
                        ${userVocab}
                        `;

                        // Save the thread material and userVocab before lesson
                        try {
                            await Thread.findByIdAndUpdate(
                                threadId, 
                                { material: result, topic: toolCall.args.title + ' by ' + toolCall.args.artist, userVocab: userVocab });

                            console.log('Update Thread.material and userVocab successfully');
                        } catch (error) {
                            console.log('Fail to update Thread.material and userVocab ', error);
                        }
                    } 

                    console.log('tool result is ', toolResult);

                    // Craft tool response
                    const toolMessage = new ToolMessage({
                        content: toolResult,
                        name: toolCall.name,
                        tool_call_id: toolCall.id!,
                    });
                    console.log("Tool result:", toolMessage.content)

                    // Append result to the messages
                    toolMessages.push(toolMessage);
                    console.log("Tool message after processing fetchLyrics", JSON.stringify(toolMessages, null, 2));

                } else if (toolCall.name === "updateLyricsFromUserInput") {
                    let toolResult = ''
                    // handle if call updateLyricsFromUserInput
                    const result = await updateLyricsFromUserInput.invoke({
                        material: toolCall.args.material,
                        artist: toolCall.args.artist,
                        title: toolCall.args.title,
                        threadid: toolCall.args.threadId,
                    });

                    // Retrieve the userVocab and update to Thread
                    const wordList = await this.extractWordsFromMaterial(toolCall.args.material);
                    const userVocab = await this.getUserVocab(wordList, this.user._id);
                        
                    // Craft the toolResult
                    toolResult = `
                    ${result ? 'Update song successfully' : 'failed to update song'}/n
                    The words user has known/introduced are:
                    ${userVocab}
                    `;


                    // Save the thread material and userVocab before lesson
                    try {
                        await Thread.findByIdAndUpdate(
                            threadId, 
                            { material: toolCall.args.material, topic: toolCall.args.title + ' by ' + toolCall.args.artist, userVocab: userVocab });

                        console.log('Update Thread.material and userVocab successfully');
                        } catch (error) {
                            console.log('Fail to update Thread.material and userVocab ', error);
                        }
                    

                    console.log('tool result is ', toolResult);
                    const toolMessage = new ToolMessage({
                        content: toolResult,
                        name: toolCall.name,
                        tool_call_id: toolCall.id!,
                    });
                    console.log("Tool result:", toolMessage);

                    // Append result to the messages
                    toolMessages.push(toolMessage);
                    console.log("Tool message after processing updateLyricsFromUserInput", JSON.stringify(toolMessages, null, 2));
                }
            }
            // Recursively process the tool calls
            return this.processWithToolCall([...currentMessages, ...toolMessages], threadId);
        }

        // Return the response messages if no tool calls are present
        return [...currentMessages, response];

    }

    async closeThread(threadId: string, vocabBeforeLesson: string): Promise<void> {
        const userId = this.user._id;

        try {
            // console.log('NOT CLOSE THREAD YET FOR TESTING PURPOSE');
            await Thread.findByIdAndUpdate(threadId, {status : "closed"});
            console.log('status updated as closed');

            // go through review lesson
            const result = await reviewLesson(threadId, userId, vocabBeforeLesson);

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
            
            if (event.postback) {
                // handle postback
                console.log('Start handle postback');
                console.log("User: ", this.user);
                console.log("Event: ", event);

                // send typing on action
                await GraphApi.sendTyping(this.user.psid, "on");

                response = await this.handlePostBack();


            } else if (event.message) {
                // handle text msg
                console.log("Start handle text message");
                console.log("User: ", this.user);
                console.log("Event: ", event);
                console.log("Is user ref: ", this.isUserRef);

                // send typing on action
                await GraphApi.sendTyping(this.user.psid, "on");

                // handle text message
                response = await this.handleTextMessage();
            }
        } catch (error) {
            console.error("Error handling message:", error);
            response.message = "Sorry, I encountered an error while processing your request.";

        }
        // respond to user
        this.sendMessage(response.message, response.threadId);

        // handle close message
        if (response.closeLesson) {
            const thread = await Thread.findById(response.threadId);
            const userVocabBeforeLesson = thread && thread.userVocab ? thread.userVocab : 'No data';
            try {
                await this.closeThread(response.threadId, userVocabBeforeLesson.toString());
                console.log("Thread closed successfully");

            } catch (error) {
                console.error("Error closing thread:", error);
                response.message = "Sorry, I encountered an error while closing the lesson.";
            }
        }

        

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
            message: outputMessage.toString(),
            threadId: thread._id,
            closeLesson: false
        }


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

    async handlePostBack(): Promise<{message: string, threadId: string}>{
        let message = 'Some error happened while handling your request';
        const event = this.webhookEvent
        const thread = await this.getThread(this.user.psid);
        await this.saveUserMessage(thread._id, this.user.psid, this.webhookEvent.postback.payload);

        if (event.postback.payload === 'GET_STARTED') {
            // send a simple hellp
            message = 'Hello welcome you to this gentle comet!';
            

        } else if (event.postback.payload === 'SET_DAILY_REMINDER') {
            // set reminder for that user
            try {
                this.setReminder(this.user.psid, 'on');
                message = 'Reminder set up at 7:30 everyday!'

            } catch (error) {
                console.log('Error while setting reminder ', error);
            }

        }
        return { message: message, threadId : thread.threadId};
    }

    async sendMessage(message: string, threadId: string): Promise<void> {

        const requestBody = {
            recipient: { id: this.user.psid },
            message: { text: message },
        };
        try {
            // send typing off action
            await GraphApi.sendTyping(this.user.psid, "off");

            // Send the message using Graph API
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

    async setReminder(psid: string, status: string): Promise<void>{
        // set reminder for a user
        try {
            const existingReminder = await Reminder.findOne({psid});

            if (!existingReminder) {
                // create new
                const newReminder = await Reminder.create({
                    psid: psid,
                    status: status,
                    time: '07:30',
                    timezone: 'Asia/Bangkok'
                });
                console.log('New reminder created ', newReminder);
                
            } else {
                // update only the status field
                await Reminder.updateOne({psid}, {status});
                console.log('Reminder updated');
            }
        } catch(error) {
            console.log('Error happen when trying to set reminder ', error);
        }
    }



}


