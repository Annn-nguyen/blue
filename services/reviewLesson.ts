import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, AIMessage, ToolMessage, HumanMessage } from '@langchain/core/messages';

import Message from '../models/Message';
import Thread from '../models/Thread';
import UserVocab from '../models/UserVocab';

import { z } from 'zod';
import { closeLessonInstruction } from './instruction';
import { timeStamp } from 'console';
import { raw } from 'body-parser';

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

async function reviewLesson(threadId: string, userId: string, vocabBeforeLesson: string): Promise<boolean> {
    try {
        let vocabUpdate = '';

        // retrieve all thread messages
        const allMessages = await Message.find({threadId: threadId})
            .sort({timeStamp: 1})
        
        const pageSize = 10;
        let page = 0;

        // apply reviewEachPart to each page in allMessages
        while (page*pageSize < allMessages.length) {
            const batchMessages = allMessages.slice(page*pageSize, (page+1)*pageSize);

            // prepare chat history for this batch
            const messages = batchMessages
                .map((message) => `At ${message.timestamp} from ${message.sender}: ${message.text}`)
                .join('\n');
            
            const vocabAdded = await reviewEachPart(messages, userId, vocabBeforeLesson, threadId);

            console.log(`Review lesson successfully for page ${page}`);

            vocabUpdate = vocabUpdate + vocabAdded;
            page++;
        }

        // save vocab update to thread
        await Thread.updateOne(
            {_id: threadId},
            {$set: { vocabUpdate: vocabUpdate}}
        );

        console.log('Update Thread.vocabUpdate successfully');
        return true;

    } catch (error) {
        console.log('Error in reviewLesson: ', error);
        return false;
    }
    

}

async function reviewEachPart(chatHistory: string, userId: string, vocabBeforeLesson: string, threadId: string): Promise<string> {
    let result = '';
    const humanMessage = `
    UserId is: ${userId}

    Vocab before thread: ${vocabBeforeLesson}

    Chat thread:
    ${chatHistory}
    `
    console.log('REVIEWING THIS PART ', chatHistory);
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
    
        result = JSON.stringify(response.vocabs);

    } catch(error) {
        console.log('Something went wrong in review lesson ',error);
    }
    return result;
}

export {reviewLesson};