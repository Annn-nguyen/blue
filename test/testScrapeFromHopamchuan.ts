import axios from 'axios';
import * as cheerio from 'cheerio';

async function scrapeLyrics(url: string): Promise<string | null> {
  try {
    // Fetch the webpage content
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    // Log response status for debugging
    console.log('HTTP Response Status:', response.status);

    // Load HTML into cheerio
    const $ = cheerio.load(response.data);

    // Select the song-lyric-note div
    const lyricsContainer = $('div.song-lyric-note');
    if (lyricsContainer.length === 0) {
      console.error('Lyrics container not found on the page');
      return null;
    }

    // Extract text from all <span class="hopamchuan_lyric"> elements
    let lyricsLines: string[] = [];
    lyricsContainer.find('span.hopamchuan_lyric').each((_, element) => {
      const text = $(element).text().trim();
      if (text) {
        lyricsLines.push(text);
      }
    });

    // Log extracted lines for debugging
    console.log('Extracted Lyric Lines:', lyricsLines);

    // Filter out non-lyric lines (e.g., "capo 1", "Dạo đầu :", "Dạo :", "Kết :")
    const nonLyricPatterns = [/^capo\s+\d+$/i, /^Dạo\s+đầu\s*:/i, /^Dạo\s*:/i, /^Kết\s*:/i];
    const filteredLines = lyricsLines.filter(line => {
      const isNonLyric = nonLyricPatterns.some(pattern => pattern.test(line));
      if (isNonLyric) {
        console.log(`Filtered out non-lyric line: ${line}`);
      }
      return !isNonLyric;
    });

    // Log filtered lines for debugging
    console.log('Filtered Lyric Lines:', filteredLines);

    // Join lines with spaces and clean up extra whitespace
    let lyrics = filteredLines.join(' ').trim();
    
    // Additional cleanup for any residual formatting
    lyrics = lyrics.replace(/\s+/g, ' ').trim();

    if (!lyrics) {
      console.error('No valid lyrics found after processing');
      return null;
    }

    return lyrics;
  } catch (error) {
    console.error('Error scraping lyrics:', error instanceof Error ? error.message : error);
    return null;
  }
}

// Example usage
async function main() {
  const url = 'https://hopamchuan.com/song/68082/co-dai-va-hoa-danh-danh/';
  const lyrics = await scrapeLyrics(url);
  if (lyrics) {
    console.log('Final Lyrics:', lyrics);
  } else {
    console.log('Failed to retrieve lyrics');
  }
}

main();