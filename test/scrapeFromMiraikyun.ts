import axios from "axios";
import * as cheerio from "cheerio";
import { setTimeout } from "timers/promises";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { raw } from "body-parser";

// Define environment variables
// Define environment variables
process.env.OPENAI_API_KEY = "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";
process.env.TAVILY_API_KEY = "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";

// Add langsmith tracing
process.env.LANGCHAIN_TRACING_V2='true';
process.env.LANGCHAIN_API_KEY = "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";
process.env.LANGCHAIN_PROJECT="blue";


const llm = new ChatOpenAI({
    model: "gpt-4.1"
});

interface ScrapeResult {
  lyrics: string;
  error?: string;
}

async function scrapeMiraikyun(url: string) : Promise<ScrapeResult> {
  try {

    

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
    };
    const response = await axios.get(url , {headers});
    console.log("Response status:", response.status);
    console.log("Response data:", response.data.slice(0, 500)); // Log first 500 characters of response data
    await setTimeout(2000); // Delay to avoid rate limiting

    if(response.status !== 200) {
      return { lyrics: "", error: `Failed to fetch page, status code: ${response.status}` };
    }
    const $ = cheerio.load(response.data);
    const contentDiv = $('div.entry-content');

    if (!contentDiv.length) {
      return { lyrics: "", error: "No lyrics found on the page." };
    };

    let rawlyrics = '';
    let lyrics = '';
    

    contentDiv.find('p').each((_, element) => {
        const text = $(element).text().trim();

        if (text) {
            rawlyrics += text + '\n';
        }
    });
    

    const prompt = "You are an expert in song lyrics. Refine the following lyrics to ensure ONLY LYRICS CAPTURED, which should be clear, accurate, only cover Japanese (Kanji and Romanji) and formatted correctly for display. Remove any unnecessary HTML tags or formatting artifacts. Here are the lyrics:\n\n" + rawlyrics;
    const llmResult = await llm.invoke([ new SystemMessage(prompt)]);
    lyrics = llmResult.content as string;
    return {lyrics};

    
  } catch (error) {
    return { lyrics: "", error: `Miraikyun scraping error: ${String(error)}` };
  }
}

async function main()  {
    const url = "https://miraikyun.com/yoasobi-tabun-lyrics/";
    const result = await scrapeMiraikyun(url);
    console.log("Scraped Lyrics:", result.lyrics);
};

main().catch(console.error);