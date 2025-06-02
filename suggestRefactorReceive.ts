import GraphApi from "./graph-api";
import Thread from "../models/Thread";
import Message from "../models/Message";
import { scrapeFromAZLyrics, scrapeMiraikyun } from "./scrapeLyrics";
import { ChatOpenAI, SystemMessage } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

// --- Model and Tool Initialization ---
const model = new ChatOpenAI({
  model: "gpt-4.1",
  openAIApiKey: process.env.OPEN_API_KEY,
});
const tavilyTool = new TavilySearch({ maxResults: 5 });

// --- Types ---
type WebhookEvent = any;
type User = any;

// --- Helper Functions ---
async function getOrCreateThread(userId: string) {
  let thread = await Thread.findOne({ userId, status: "open" });
  if (!thread) {
    thread = await Thread.create({ userId, status: "open", startTime: new Date() });
    console.log("New thread created:", thread);
  }
  return thread;
}

async function saveUserMessage(threadId: string, userId: string, text: string) {
  return Message.create({
    threadId,
    sender: "user",
    userId,
    text,
    timestamp: new Date(),
  });
}

async function saveBotMessage(threadId: string, userId: string, text: string) {
  return Message.create({
    threadId,
    sender: "bot",
    userId,
    text,
    timestamp: new Date(),
  });
}

function buildChatHistory(messages: any[]) {
  return messages
    .reverse()
    .map((m) => `At ${m.timestamp} from ${m.sender}: ${m.text}`)
    .join("\n");
}

function buildPrompt(instruction: string, context: any, chatHistory: string) {
  return `${instruction}\n\nCurrent context is:\n\n${JSON.stringify(context)}\n\nCurrent conversation is: ${chatHistory}`;
}

// --- Main Class ---
export default class Receive {
  user: User;
  webhookEvent: WebhookEvent;
  isUserRef: boolean;

  constructor(user: User, webhookEvent: WebhookEvent, isUserRef: boolean) {
    this.user = user;
    this.webhookEvent = webhookEvent;
    this.isUserRef = isUserRef;
  }

  async handleMessage(): Promise<void> {
    const event = this.webhookEvent;
    let responses: any;

    if (event.reaction !== undefined) {
      console.log("Ignore reaction event");
      return;
    }

    try {
      if (event.message) {
        responses = await this.handleTextMessage();
      }
      // Add other event types (attachments, quick replies, postbacks) here if needed
    } catch (error) {
      console.error(error);
      responses = {
        responseText: `An error has occurred: '${error}'. We have been notified and will fix the issue shortly!`,
      };
    }

    // Send and save response(s)
    if (Array.isArray(responses)) {
      let delay = 0;
      for (const response of responses) {
        this.sendMessage(response.responseText, delay * 2000, this.isUserRef, response.threadId);
        delay++;
      }
    } else if (responses) {
      this.sendMessage(responses.responseText, 1, this.isUserRef, responses.threadId);
    }

    // Close lesson if needed
    if (responses && responses.closeLesson) {
      try {
        await Thread.findByIdAndUpdate(responses.threadId, { status: "closed" });
        console.log("Thread closed:", responses.threadId);
      } catch (error) {
        console.error("Error closing thread:", error);
      }
    }
  }

  async handleTextMessage(): Promise<{ responseText: string; threadId: string; closeLesson: boolean }> {
    let closeLesson = false;
    let context: any = {};
    const userMessage = this.webhookEvent.message.text ?? "";

    // --- Thread and Message Management ---
    const existingThread = await getOrCreateThread(this.user.psid);
    await saveUserMessage(existingThread._id, this.user.psid, userMessage);

    // --- Lesson Closure ---
    const closeLessonKeywords = ["close lesson", "start new lesson", "finish lesson"];
    if (closeLessonKeywords.some((kw) => userMessage.toLowerCase().includes(kw))) {
      return {
        responseText: "Yes, I will close the lesson and update your progress. You can start a new lesson anytime by sending me a message.",
        threadId: existingThread._id,
        closeLesson: true,
      };
    }

    // --- Decide Whether to Search for Lyrics ---
    const last3Messages = await Message.find({ threadId: existingThread._id }).sort({ timestamp: -1 }).limit(3).exec();
    const last3MessageText = buildChatHistory(last3Messages);

    const decideSearchSchema = z.object({
      callSearch: z.boolean(),
      query: z.string(),
      songName: z.string(),
      artist: z.string(),
    });

    const decideSearchPrompt = `
      [Prompt omitted for brevity, keep your original prompt here]
    `;

    let responseText = "";
    try {
      const callSearchDecision = await model.withStructuredOutput(decideSearchSchema).invoke([new SystemMessage(decideSearchPrompt)]);
      if (callSearchDecision.callSearch) {
        // Update thread topic
        await Thread.findByIdAndUpdate(existingThread._id, {
          topic: `${callSearchDecision.songName} by ${callSearchDecision.artist}`,
        });

        // Search for lyrics
        const rawSearchResult = await tavilyTool.invoke({ query: callSearchDecision.query });
        let lyricsUrl = "";
        for (const result of rawSearchResult.results) {
          if (result.url && (result.url.includes("azlyrics.com") || result.url.includes("miraikyun.com"))) {
            lyricsUrl = result.url;
            break;
          }
        }

        // Scrape lyrics
        if (!lyricsUrl) {
          responseText = `I cannot get the lyrics for the song you requested. Please let me know the lyrics instead.`;
        } else {
          let scrapedLyrics = "";
          let scrapeResult;
          if (lyricsUrl.includes("azlyrics.com")) {
            scrapeResult = await scrapeFromAZLyrics(lyricsUrl);
          } else {
            scrapeResult = await scrapeMiraikyun(lyricsUrl);
          }
          if (scrapeResult.error) {
            responseText = `I cannot get the lyrics for the song you requested. Please let me know the lyrics instead.`;
          } else {
            scrapedLyrics = scrapeResult.lyrics;
            await Thread.findByIdAndUpdate(existingThread._id, { material: scrapedLyrics });
            const displayLyrics = scrapedLyrics.slice(0, 500);
            responseText = `I found the lyrics for the song you requested, let me know if it is the right song! Here is the lyrics:\n\n${displayLyrics}`;
          }
        }
        return { responseText, threadId: existingThread._id, closeLesson };
      }
    } catch (error) {
      console.error("Error deciding whether to call searchTool:", error);
    }

    // --- AI Tutor Response ---
    const lastMessages = await Message.find({ threadId: existingThread._id }).sort({ timestamp: -1 }).limit(50).exec();
    const chatHistory = buildChatHistory(lastMessages);

    const instruction = `
      # OVERVIEW
      You are a language tutor through songs...
      [Keep your original instruction here]
    `;
    const prompt = buildPrompt(instruction, context, chatHistory);

    const response = await model.invoke([new SystemMessage(prompt)]);
    if (typeof response.content === "string") {
      responseText = response.content;
    } else if (Array.isArray(response.content)) {
      responseText = response.content.map((part: any) => part.text ?? "").join("");
    } else {
      responseText = String(response.content ?? response.text ?? response);
    }

    return { responseText, threadId: existingThread._id, closeLesson };
  }

  sendMessage(response: any, delay = 0, isUserRef: boolean, threadId: string): void {
    if (!response) return;
    const messagePayload = typeof response === "string" ? { text: response } : response;
    const recipient = isUserRef
      ? { user_ref: this.user.psid }
      : { id: this.user.psid };
    const requestBody = { recipient, message: messagePayload };

    setTimeout(() => {
      (async () => {
        try {
          const sent = await GraphApi.callSendApi(requestBody);
          if (sent && !sent.error) {
            await saveBotMessage(threadId, this.user.psid, messagePayload.text ?? "");
            console.log("New bot message saved to db");
          }
        } catch (error) {
          console.error("Error sending or saving bot message:", error);
        }
      })();
    }, delay);
  }
}