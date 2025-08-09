import { z } from "zod";


import {Song} from "../models/Song";
import UserVocabService from "../services/userVocabService";
import { IUserVocab, UserVocab } from "../models/UserVocab";
import { IThread, Thread } from "../models/Thread";
import { tool } from "@langchain/core/tools";
import LLMService from "../services/llmService";
import { analyzeUserVocab } from "./analyzeUserVocab";

async function updateLyricsFromUserInput(title: string, artist: string, searchKeywords:string, language: string, lyrics: string, threadId: string, userId: string) : Promise<string> {
    let result = 'Update Failed';

    try {
        // add Song to the catalog
        await Song.findOneAndUpdate(
                { title, artist },
                {
                    $set: {
                        lyrics,
                        language,
                        searchKeywords
                    }
                },
                { upsert: true, new: true }
            )
        console.log('Song upsert to catalog!');

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

        result = 'Update Successful'
    } catch(error) {
        console.log('Error while update lyrics from user input: ', error);
    }

    return result;
}

const updateLyricsFromUserInputSchema = z.object({
    artist: z.string().describe("Artist of the song"),
    title: z.string().describe("Title of the song"),
    searchKeywords: z.string().describe('this include all the search keywords that can be used to search for this song, you can translate the english name to the song language to search. For example if user search for probably song by yoasobi, search keywords will be (probably, tabun, たぶん)'),
    language: z.string().describe("Language of the song, must be in the list: English, Chinese, Japanese, Korean, French, Italian, Other"),  
    lyrics: z.string().describe("Lyrics material to update the thread with"),
    threadId: z.string().describe("Id of the thread that the chatbot will respond to"),
    userId: z.string().describe("Id of the user that the chatbot is talking to")
});

export { updateLyricsFromUserInput};

export  const updateLyricsFromUserInputTool = tool(
    async ({artist, title, searchKeywords, language, lyrics, threadId, userId}: {artist: string, title: string, searchKeywords: string, language: string, lyrics: string, threadId: string, userId: string}) => {
            
            let result = 'Update Failed';
            try {
                result = await updateLyricsFromUserInput(title, artist, searchKeywords, language, lyrics, threadId, userId);
    
            } catch(error) {
                console.error('Error while calling updateLyricsFromUserInput tool');
            }
            return result;
    },
    {
        name: "updateLyricsFromUserInputTool",
        description: "Update lyrics provided by user to system",
        schema: updateLyricsFromUserInputSchema,
    }
    
)