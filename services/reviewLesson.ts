import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, AIMessage, ToolMessage, HumanMessage } from '@langchain/core/messages';

import Message from '../models/Message';
import Thread from '../models/Thread';
import UserVocab from '../models/UserVocab';

import { z } from 'zod';
import { closeLessonInstruction } from './instruction';

const model = new ChatOpenAI({
    model: 'gpt-4.1-mini'
});

const vocabSchema = z.object({
    userId: z.string().describe('_id of the user'),
    word: z.string().describe('the word to learn, if japanese or chinese, return kanji'),
    note: z.string().describe('note for the word: for japanese/chinese/korean, note its romanji'),
    meaning: z.string().describe('meaning of the word in the language of the learner'),
    status: z.enum(["introduced", "known"]).describe('status of the word'),
    language: z.enum(["English", "Chinese", "Japanese", "Korean", "French", "Italian"]).describe('language of the word')
});

const vocabArraySchema = z.object({
    vocabs: z.array(vocabSchema).describe('list of words to update to user vocab')
});



async function reviewLesson(chatHistory: string, userId: string, vocabBeforeLesson: string): Promise<boolean> {
    let result = false;

    const humanMessage = `
    UserId is: ${userId}

    Vocab before thread: ${vocabBeforeLesson}

    Chat thread:
    ${chatHistory}
    `

    try {

        //invoke model to review chat data and update userVocab
        const response = await model.withStructuredOutput(vocabArraySchema).invoke([
            new SystemMessage(closeLessonInstruction),
            new HumanMessage(humanMessage)
        ]);
        console.log('Vocab update as ', response);

        // update Vocab to database
        for (const item of response.vocabs) {
            await UserVocab.updateOne(
                { userId, word: item.word },
                {
                    $set: {
                        status: item.status,
                        note: item.note || "",
                        meaning: item.meaning,
                        language: item.language
                    }
                },
                { upsert: true }
            )

        }
        result = true;

    } catch(error) {
        console.log('Something went wrong in review lesson ',error);
    }
    return result;
}

export {reviewLesson};