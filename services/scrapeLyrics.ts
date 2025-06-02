import axios from 'axios';
import { raw } from 'body-parser';
import * as cheerio from 'cheerio';

interface ScrapeResult {
    lyrics: string;
    error?: string;
}

async function scrapeMiraikyun(url: string): Promise<ScrapeResult> {
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

        return { lyrics: lyrics}
    } catch (error) {
        console.error("Error scraping Miraikyun:", error);
        return { lyrics: "", error: `Miraikyun scraping error: ${String(error)}` };
    }

}

async function scrapeFromAZLyrics(url: string): Promise<ScrapeResult> {
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

export { scrapeMiraikyun, scrapeFromAZLyrics };