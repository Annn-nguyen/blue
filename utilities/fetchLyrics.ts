import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";


import axios from "axios";
import * as cheerio from 'cheerio';

import {Song} from "../models/Song";
import LLMService from "../services/llmService";
import UserVocabService from "../services/userVocabService";
import { IUserVocab, UserVocab } from "../models/UserVocab";
import { IThread, Thread } from "../models/Thread";
import { tool } from "@langchain/core/tools";

import {analyzeUserVocab} from "./analyzeUserVocab";

interface Lyric {
    lyrics: string;
    error?: string;
}
const tavilyTool = new TavilySearch({maxResults: 10});

async function fetchLyrics(title: string, artist: string, searchKeywords: string, language: string, threadId: string, userId: string) :Promise<string> {

    let lyrics = '';
    try {
        // try to fetch from our own catalog
    let song = await Song.findOne({
        artist,
        searchKeywords: { $regex: title, $options: "i"}
    });
    console.log('Searching in catalog: by ', artist, ' with title ', title, ' included in  search keywords: ', searchKeywords,' and result is: ', song);

    if (!song) {
        song = await Song.findOne({
            searchKeywords: { $regex: title, $options: "i"}
        }); 
        console.log('Searching in catalog only with title ',title, ' included in search keywords: ', searchKeywords,' and result is: ', song); 
    }

    if (song) {
        console.log('Found in catalog: ', song.title, ' by ', song.artist)
        lyrics = song.lyrics.toString();
    } else {
        console.log('Not found in catalog: ', title, ' by ', artist, ' with search keywords: ', searchKeywords);
        // if not exist, fetch from online source
        // call tavily search to get the url
        const searchQuery = 'lyrics of the song ' + title + " by " + artist + " (prefer on AZlyrics.com or miraikyun.com)";
        const searchResult = await tavilyTool.invoke({query: searchQuery});
        console.log('Tavily lyrics search result: ', searchResult)

        // scrape lyrics from website if possible
        
        for (const item of searchResult.results) {
            if (item.url.includes('azlyrics.com')) {
                console.log('SCRAPING from azlyrics');
                const result = await scrapeFromAZlyrics(item.url);
                if (result.lyrics) {
                    lyrics = result.lyrics;
                    break;
                }
            }

            if (item.url.includes('miraikyun.com')) {
                console.log('SCRAPING from miraikyun');
                const result = await scrapeFromMiraikyun(item.url);
                if (result.lyrics) {
                    lyrics = result.lyrics;
                    break;
                }
            }
        }

        // store lyrics scraped to our catalog
            console.log('Saving to song catalog: ', title, ' by ', artist, ' with search keyword: ', searchKeywords, ' and language: ', language);
            await Song.create({
                title: title,
                artist: artist,
                searchKeywords: searchKeywords,
                lyrics: lyrics,
                language: language
            })
            console.log('SAVED TO SONG COLLECTION!')

        console.log('Lyrics scraped: ', lyrics);
    }
    

    // if lyrics found 
    if (lyrics != '') {
        // analyze vocab of the song 
            const wordList = await LLMService.breakdownVocab(lyrics);
            console.log('Song words breakdown: ', wordList);

            const userVocabBeforeLesson = await analyzeUserVocab(userId, wordList);
            console.log('Vocab analyzed: ', userVocabBeforeLesson)

            // update to thread data
            await Thread.findByIdAndUpdate(threadId, {
                material: lyrics,
                userVocab: userVocabBeforeLesson
            });

            console.log('Thread updated successfully');
    } 
    } catch (error) {
        console.error('Error while running fetch lyrics!');
    }

    if (lyrics === '') {
        lyrics = 'No lyrics found';
    }

    return lyrics;


}

async function scrapeFromAZlyrics(url: string): Promise<Lyric> {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        };
        const response = await axios.get(url, {headers});

        if (response.status !== 200) {
            console.error("Failed to fetch data from AZlyrics. Status code:", response.status);
            return {lyrics: "", error: "Failed to fetch data from AZLyrics."};
        }

        const content = cheerio.load(response.data);
        const lyrics = content(".col-xs-12.col-lg-8.text-center > div:not([class])")
            .text()
            .trim();

        console.log("Scraped lyrics from AZLyrics:", lyrics);

        if (lyrics.length === 0) {
            console.error("No lyrics found on AZLyrics page.");
            return {lyrics: "", error: "No lyrics found on AZLyrics."};
        }
        return { lyrics: lyrics };
    } catch (error) {  
        console.error("Error scraping AZLyrics:", error);
        return { lyrics: "", error: `AZLyrics scraping error: ${String(error)}` };
    }
}

async function scrapeFromMiraikyun(url: string): Promise<Lyric> {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        };
        const response = await axios.get(url, {headers});

        if (response.status !== 200) {
            console.error("Failed to fetch page from ", url,". Status code:", response.status);
            return {lyrics: "", error: `Failed to fetch page, status code: ${response.status}`};
        };

        const content = cheerio.load(response.data);
        const contentDiv = content('div.entry-content');

        if (!contentDiv.length){
            return { lyrics: "", error: "No lyrics found" };
        };

        let lyrics = '';

        contentDiv.find('p').each((_, element) => {
            const text = content(element).text().trim();
            if (text) {
                lyrics += text + '\n';
            };
        });

        console.log("Scraped lyrics from Miraikyun:", lyrics);

        return { lyrics: lyrics}
    } catch (error) {
        console.error("Error scraping Miraikyun:", error);
        return { lyrics: "", error: `Miraikyun scraping error: ${String(error)}` };
    }

}




const fetchLyricsSchema = z.object({
    artist: z.string().describe("Artist of the song to fetch lyrics for"),
    title: z.string().describe("Title of the song to fetch lyrics for"),
    searchKeywords: z.string().describe('this include all the search keywords that can be used to search for this song, you can translate the english name to the song language to search. For example if user search for probably song by yoasobi, search keywords will be (probably, tabun, たぶん)'),
    language: z.string().describe("Language of the song, must be in the list: English, Chinese, Japanese, Korean, French, Italian, Other"),
    threadId: z.string().describe("Id of the thread that the chatbot will respond to"),
    userId: z.string().describe("Id of the user that the chatbot is talking to")
});


export { fetchLyrics, scrapeFromAZlyrics, scrapeFromMiraikyun};

export const fetchLyricsTool = tool(
    async({artist, title, searchKeywords, language, threadId, userId}: {artist: string, title: string, searchKeywords: string, language: string, threadId: string, userId: string}) => {
        
        let lyrics = '';
        try {
            lyrics = await fetchLyrics(title, artist, searchKeywords, language, threadId, userId);

        } catch(error) {
            console.error('Error while calling fetchLyrics tool');
        }
        return lyrics;
    },
    {
        name: "fetchLyricsTool",
        description: "Fetch lyrics of a song by a query",
        schema: fetchLyricsSchema,
    }
)
