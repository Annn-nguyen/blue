import GraphApi from "./graph-api";

import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";
import { tool } from "@langchain/core/tools";

import Thread from "../models/Thread";
import Message from "../models/Message";

import { mainInstruction } from "./instruction";

import { scrapeFromAZLyrics, scrapeMiraikyun } from "./scrapeLyrics";

import dotenv from "dotenv";
import { request } from "express";
import { raw } from "body-parser";
dotenv.config();

const model = new ChatOpenAI({
    model: "o4-mini",
});



const tavilyTool = new TavilySearch({ maxResults: 5 });

const fetchLyricsSchema = z.object({
    artist: z.string().describe("Artist of the song to fetch lyrics for"),
    title: z.string().describe("Title of the song to fetch lyrics for"),
    query: z.string().describe("Query to search for lyrics, format like 'Full lyrics of Tsubame by Yoasobi'"),
});

const fetchLyrics = tool(
    async ({artist, title, query}:{ artist: string, title: string, query: string }) => {

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

// Bind the tool to the model
const tools = [fetchLyrics];

const modelWithTool = model.bindTools([fetchLyrics]);

type WebhookEvent = any;
type User = any;

export default class Receive {

    user: User;
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
            try {
                await Thread.findByIdAndUpdate(response.threadId, { status: "closed" });
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
        
        ## Current conversation:
        ${chatHistory}
        
        Please generate the suitable response to user (within 150 words)
        `;
        console.log('PROMPT IS: ', prompt);
        try {
            const response = await modelWithTool.invoke([new SystemMessage(prompt)]);

            if (response instanceof AIMessage && response.tool_calls?.length) {
                for (const toolCall of response.tool_calls) {
                    const toolName = toolCall.name;
                    const toolArgs = toolCall.args;
                    const toolCallId = toolCall.id;
                    console.log("Tool call detected:", toolName, toolArgs, toolCallId);
               
                    // find and execute the tool
                    const tool = tools.find(t => t.name === toolName);
                    if (tool) {
                        const result = await tool.invoke(toolArgs);
                        console.log("Tool result:", result);

                        // Append result to the ToolMessage
                        prompt = prompt + `\n\nTool result: ${JSON.stringify(result)}`;
                    }
                
                }

            } else {
                console.log("Response message:", response);
                return { message: response.content, threadId: thread._id, closeLesson: false };
            }
        } catch (error) {
            console.error("Error invoking model:", error);
        }
        console.log("No response from model, not respond to user");
        return { message: "", threadId: "", closeLesson: false };
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


