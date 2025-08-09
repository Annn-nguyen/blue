import { ChatOpenAI } from '@langchain/openai';
import { TavilySearch } from '@langchain/tavily';

import { SystemMessage  } from '@langchain/core/messages';

process.env.TAVILY_API_KEY = "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";


const tavilyTool = new TavilySearch({maxResults: 5});




async function searchTavily(query: string) {
    const rawResult = await tavilyTool.invoke({query});
    console.log('Tavily search results:', rawResult);
};

// run the function with a sample query
async function main() {
    const query = 'Full lyrics of the song Heartbeat by Yoasobi on AZlyrics.com';
    await searchTavily(query);
}

main().catch(console.error);



