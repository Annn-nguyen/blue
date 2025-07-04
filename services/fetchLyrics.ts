import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, AIMessage, ToolMessage, BaseMessage} from "@langchain/core/messages";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";
import { tool } from "@langchain/core/tools";

import axios from "axios";
import * as cheerio from 'cheerio';

import Song from "../models/Song";
import dotenv from "dotenv";

dotenv.config();

const model = new ChatOpenAI({
    model: "gpt-4o-mini"
});

interface Lyric {
    lyrics: string;
    error?: string;
}
const tavilyTool = new TavilySearch({maxResults: 10});

async function fetchLyrics(title: string, artist: string, searchKeywords: string, language: string) :Promise<string> {

    let lyrics = 'No result';
    // try to fetch from our own catalog
    let song = await Song.findOne({
        artist,
        searchKeyword: { $regex: title, $options: "i"}
    });
    console.log('Searching in catalog: by ', artist, ' with search keywords: ', searchKeywords,' and result is: ', song);

    if (!song) {
        song = await Song.findOne({
            searchKeyword: { $regex: title, $options: "i"}
        }); 
        console.log('Searching in catalog only with with search keywords: ', searchKeywords,' and result is: ', song); 
    }

    if (song) {
        console.log('Found in catalog: ', song.title, ' by ', song.artist)
        lyrics = song.lyrics.toString();
        return lyrics;
    }
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

    console.log('Lyrics scraped: ', lyrics)

    // store lyrics scraped to our catalog
    if (lyrics != '') {
        try {
            console.log('Saving to song catalog: ', title, ' by ', artist, ' with search keyword: ', searchKeywords, ' and language: ', language);
            await Song.create({
                title: title,
                artist: artist,
                searchKeywords: searchKeywords,
                lyrics: lyrics,
                language: language
            })
            console.log('SAVED TO SONG COLLECTION!')
        } catch (error) {
            console.log('Error while saving to song catalog: ', error)
        }
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

export { fetchLyrics, scrapeFromAZlyrics, scrapeFromMiraikyun};


