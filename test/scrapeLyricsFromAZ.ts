import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch} from "@langchain/tavily";
import { PromptTemplate } from "@langchain/core/prompts";
import axios from "axios";
import * as cheerio from "cheerio";
import { z } from "zod";
import { SystemMessage } from "@langchain/core/messages";


// Define environment variables
process.env.OPENAI_API_KEY = "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";
process.env.TAVILY_API_KEY = "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";

// Add langsmith tracing
process.env.LANGCHAIN_TRACING_V2='true';
process.env.LANGCHAIN_API_KEY = "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";
process.env.LANGCHAIN_PROJECT="blue";


// Define TypeScript interfaces
interface DecisionResponse {
  needs_search: boolean;
  search_query: string;
  lyrics_request?: { track: string; artist: string };
}

// Zod schema for validating decision response
const DecisionSchema = z.object({
  needs_search: z.boolean(),
  search_query: z.string(),
  lyrics_request: z
    .object({
      track: z.string(),
      artist: z.string(),
    })
    .optional(),
});

// Initialize the OpenAI model
const llm = new ChatOpenAI({
  model: "gpt-4",
  temperature: 0.7,
});

// Initialize the Tavily search tool with higher maxResults
const tavilyTool = new TavilySearch({ maxResults: 5 });

// Prompt to parse song details and generate lyric-specific query


const testPrompt = `
  You are an intelligent assistant specializing in song lyrics. For the given user input requesting song lyrics, extract the song title and artist (if provided). Always generate a search query targeting reliable lyric sites (e.g., azlyrics.com, genius.com, lyrics.com) for full lyrics. Respond with a JSON object containing:
  - "needs_search": true if Tavily search is needed (e.g., artist missing or to verify song), false if song and artist are clear for direct scraping
  - "search_query": a precise query including song title, artist (if provided), and terms like "full lyrics" with site-specific keywords
  - "lyrics_request": an object with "track" and "artist" if extractable, otherwise empty

  User Input: Hey i want to learn Probably by Yoasobi

  Example:
  {
    "needs_search": false,
    "search_query": "full lyrics 'Bohemian Rhapsody' Queen site:azlyrics.com",
    "lyrics_request": { "track": "Bohemian Rhapsody", "artist": "Queen" }
  }


`

// Prompt to generate the final response
const responsePrompt = PromptTemplate.fromTemplate(`
  You are an intelligent assistant specializing in song lyrics. Use the user input and any provided lyrics to return the full lyrics of the requested song. If lyrics are partial, note this and suggest checking sources like AZLyrics, Genius, or Lyrics.com. If no lyrics are found, inform the user and suggest alternatives.

  User Input: {input}
  Lyrics (if any): {lyrics}

  Format the response with lyrics in a code block if available.
`);

// Function to scrape lyrics from AZLyrics
async function scrapeAZLyrics(track: string, artist: string): Promise<string> {
  try {
    const formattedArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, "");
    const formattedTrack = track.toLowerCase().replace(/[^a-z0-9]/g, "");
    const url = `https://www.azlyrics.com/lyrics/${formattedArtist}/${formattedTrack}.html`;
    console.log("Scraping URL:", url);
    const response = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    const $ = cheerio.load(response.data);
    const lyrics = $(".col-xs-12.col-lg-8.text-center > div:not([class])")
      .text()
      .trim();
    return lyrics || "No lyrics found on AZLyrics.";
  } catch (e) {
    console.error("Error scraping AZLyrics:", e);
    return `AZLyrics scraping error: ${String(e)}`;
  }
}

// Function to process user request for song lyrics
async function processLyricsRequest(requestContent: string): Promise<string> {
  try {
    // Step 1: Parse song details and generate query

    const decisionResponse = await llm.invoke([new SystemMessage(testPrompt) ])
    ;
    console.log("Decision Response:", decisionResponse.content);
    let decision: DecisionResponse;
    try {
      decision = DecisionSchema.parse(JSON.parse(decisionResponse.content as string));
    } catch (e) {
      throw new Error(`Failed to parse decision response: ${e}`);
    }

    // Step 2: Try scraping AZLyrics if song and artist are known
    let lyrics: string = "";
    if (!decision.needs_search && decision.lyrics_request) {
      lyrics = await scrapeAZLyrics(
        decision.lyrics_request.track,
        decision.lyrics_request.artist
      );
      console.log("Scraped Lyrics:", lyrics);
      if (!lyrics.includes("error") && lyrics !== "No lyrics found on AZLyrics.") {
        // If scraping succeeds, use these lyrics
        return (await llm.invoke(
          await responsePrompt.format({
            input: requestContent,
            lyrics,
          })
        )).content as string;
      }
    }

    // Step 3: Fallback to Tavily search
    if (decision.needs_search || lyrics.includes("error") || lyrics === "No lyrics found on AZLyrics.") {
      try {
        const results = await tavilyTool.invoke({ query: decision.search_query });
        // Aggregate lyrics from multiple results, prioritizing lyric sites
        lyrics = results
          .filter((result: any) => result.content.trim().length > 0)
          .map((result: any) => result.content)
          .join("\n\n---\n\n");
        lyrics = lyrics || "No lyrics found in search results.";
      } catch (e) {
        lyrics = `Tavily search error: ${String(e)}`;
      }
    }

    // Step 4: Generate final response
    const finalResponse = await llm.invoke(
      await responsePrompt.format({
        input: requestContent,
        lyrics,
      })
    );
    return finalResponse.content as string;

  } catch (e) {
    return `An error occurred: ${String(e)}`;
  }
}

// Example usage
async function main() {
  const requestContent = "Hey i want to learn heartbeat by Yoasobi on AZLyrics.com";
  const response = await processLyricsRequest(requestContent);
  console.log("Final Response:");
  console.log(response);
}

main().catch(console.error);