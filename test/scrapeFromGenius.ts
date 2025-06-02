// import { ChatOpenAI } from "@langchain/openai";
// import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
// import { PromptTemplate } from "@langchain/core/prompts";
// import axios from "axios";
// import cheerio from "cheerio";
// import { z } from "zod";

// // Define environment variables
// process.env.OPENAI_API_KEY = "your-openai-api-key";
// process.env.TAVILY_API_KEY = "your-tavily-api-key";

// // Define TypeScript interfaces
// interface DecisionResponse {
//   needs_search: boolean;
//   search_query: string;
//   lyrics_request?: { track: string; artist: string };
// }

// // Zod schema for validating decision response
// const DecisionSchema = z.object({
//   needs_search: z.boolean(),
//   search_query: z.string(),
//   lyrics_request: z
//     .object({
//       track: z.string(),
//       artist: z.string(),
//     })
//     .optional(),
// });

// // Initialize the OpenAI model
// const llm = new ChatOpenAI({
//   model: "gpt-4",
//   temperature: 0.7,
// });

// // Initialize the Tavily search tool with optimized settings
// const tavilyTool = new TavilySearchResults({
//   maxResults: 10,
//   includeRawContent: true,
//   searchDepth: "advanced",
// });

// // Prompt to parse song details and generate lyric-specific query
// const decisionPrompt = PromptTemplate.fromTemplate(`
//   You are an intelligent assistant specializing in song lyrics. For the given user input requesting song lyrics, extract the song title and artist (if provided). Always generate a search query targeting reliable lyric sites (e.g., genius.com, azlyrics.com, lyrics.com) for full lyrics. Respond with a JSON object containing:
//   - "needs_search": true if Tavily search is needed (e.g., artist missing or to verify song), false if song and artist are clear for direct scraping
//   - "search_query": a precise query including song title, artist (if provided), and terms like "full lyrics" with site-specific keywords (e.g., site:genius.com)
//   - "lyrics_request": an object with "track" and "artist" if extractable, otherwise empty

//   User Input: {input}

//   Example:
//   {
//     "needs_search": false,
//     "search_query": "full lyrics 'Bohemian Rhapsody' Queen site:genius.com",
//     "lyrics_request": { "track": "Bohemian Rhapsody", "artist": "Queen" }
//   }
// `);

// // Prompt to generate the final response
// const responsePrompt = PromptTemplate.fromTemplate(`
//   You are an intelligent assistant specializing in song lyrics. Use the user input and any provided lyrics to return the full lyrics of the requested song. If lyrics are partial, note this, estimate completeness (e.g., "appears to be partial, missing verses"), and suggest checking sources like Genius, AZLyrics, or Lyrics.com. If no lyrics are found, inform the user and suggest alternatives. Include the character count of the provided lyrics for reference.

//   User Input: {input}
//   Lyrics (if any): {lyrics}
//   Lyrics Character Count: {char_count}

//   Format the response with lyrics in a code block if available.
// `);

// // Function to scrape lyrics from Genius.com
// async function scrapeGeniusLyrics(track: string, artist: string): Promise<{ lyrics: string; charCount: number }> {
//   try {
//     // Format URL: e.g., https://genius.com/Queen-Bohemian-Rhapsody-lyrics
//     const formattedArtist = artist
//       .toLowerCase()
//       .replace(/[^a-z0-9\s]/g, "")
//       .replace(/\s+/g, "-");
//     const formattedTrack = track
//       .toLowerCase()
//       .replace(/[^a-z0-9\s]/g, "")
//       .replace(/\s+/g, "-");
//     const url = `https://genius.com/${formattedArtist}-${formattedTrack}-lyrics`;
//     const response = await axios.get(url, {
//       headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
//     });
//     const $ = cheerio.load(response.data);
//     // Extract lyrics from Lyrics__Container or similar
//     const lyrics = $("[data-lyrics-container='true']").text().trim();
//     if (!lyrics) {
//       return { lyrics: "No lyrics found on Genius.", charCount: 0 };
//     }
//     // Clean up annotations and extra whitespace
//     const cleanedLyrics = lyrics.replace(/\[\w+\]/g, "").replace(/\n\s*\n/g, "\n").trim();
//     return { lyrics: cleanedLyrics, charCount: cleanedLyrics.length };
//   } catch (e) {
//     return { lyrics: `Genius scraping error: ${String(e)}`, charCount: 0 };
//   }
// }

// // Function to scrape lyrics from AZLyrics (for flexibility)
// async function scrapeAZLyrics(track: string, artist: string): Promise<{ lyrics: string; charCount: number }> {
//   try {
//     const formattedArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, "");
//     const formattedTrack = track.toLowerCase().replace(/[^a-z0-9]/g, "");
//     const url = `https://www.azlyrics.com/lyrics/${formattedArtist}/${formattedTrack}.html`;
//     const response = await axios.get(url, {
//       headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
//     });
//     const $ = cheerio.load(response.data);
//     const lyrics = $(".col-xs-12.col-lg-8.text-center > div:not([class])")
//       .text()
//       .trim();
//     if (!lyrics) {
//       return { lyrics: "No lyrics found on AZLyrics.", charCount: 0 };
//     }
//     return { lyrics, charCount: lyrics.length };
//   } catch (e) {
//     return { lyrics: `AZLyrics scraping error: ${String(e)}`, charCount: 0 };
//   }
// }

// // Function to process user request for song lyrics
// async function processLyricsRequest(requestContent: string): Promise<string> {
//   try {
//     // Step 1: Parse song details and generate query
//     const decisionResponse = await llm.invoke(
//       await decisionPrompt.format({ input: requestContent })
//     );
//     let decision: DecisionResponse;
//     try {
//       decision = DecisionSchema.parse(JSON.parse(decisionResponse.content as string));
//     } catch (e) {
//       throw new Error(`Failed to parse decision response: ${e}`);
//     }

//     // Step 2: Try scraping Genius first if song and artist are known
//     let lyrics: string = "";
//     let charCount: number = 0;
//     if (!decision.needs_search && decision.lyrics_request) {
//       const geniusResult = await scrapeGeniusLyrics(
//         decision.lyrics_request.track,
//         decision.lyrics_request.artist
//       );
//       lyrics = geniusResult.lyrics;
//       charCount = geniusResult.charCount;
//       console.log(`Genius response length: ${charCount} characters`);
//       if (!lyrics.includes("error") && lyrics !== "No lyrics found on Genius.") {
//         // If Genius scraping succeeds, use these lyrics
//         return (await llm.invoke(
//           await responsePrompt.format({
//             input: requestContent,
//             lyrics,
//             char_count: charCount.toString(),
//           })
//         )).content as string;
//       }

//       // Fallback to AZLyrics if Genius fails
//       const azLyricsResult = await scrapeAZLyrics(
//         decision.lyrics_request.track,
//         decision.lyrics_request.artist
//       );
//       lyrics = azLyricsResult.lyrics;
//       charCount = azLyricsResult.charCount;
//       console.log(`AZLyrics response length: ${charCount} characters`);
//       if (!lyrics.includes("error") && lyrics !== "No lyrics found on AZLyrics.") {
//         // If AZLyrics scraping succeeds, use these lyrics
//         return (await llm.invoke(
//           await responsePrompt.format({
//             input: requestContent,
//             lyrics,
//             char_count: charCount.toString(),
//           })
//         )).content as string;
//       }
//     }

//     // Step 3: Fallback to Tavily search
//     try {
//       const results = await tavilyTool.invoke({ query: decision.search_query });
//       // Aggregate lyrics from multiple results, prioritizing lyric sites
//       lyrics = results
//         .filter((result: any) => result.content.trim().length > 0)
//         .map((result: any) => result.content)
//         .join("\n\n---\n\n");
//       charCount = lyrics.length;
//       lyrics = lyrics || "No lyrics found in search results.";
//       console.log(`Tavily response length: ${charCount} characters`);
//     } catch (e) {
//       lyrics = `Tavily search error: ${String(e)}`;
//       charCount = 0;
//     }

//     // Step 4: Generate final response
//     const finalResponse = await llm.invoke(
//       await responsePrompt.format({
//         input: requestContent,
//         lyrics,
//         char_count: charCount.toString(),
//       })
//     );
//     return finalResponse.content as string;

//   } catch (e) {
//     return `An error occurred: ${String(e)}`;
//   }
// }

// // Example usage
// async function main() {
//   const requestContent = "Full lyrics of 'Bohemian Rhapsody' by Queen";
//   const response = await processLyricsRequest(requestContent);
//   console.log("Final Response:");
//   console.log(response);
// }

// main().catch(console.error);