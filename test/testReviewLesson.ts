import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, AIMessage, HumanMessage } from '@langchain/core/messages';
import { closeLessonInstruction } from '../services/instruction';
import dotenv from 'dotenv';
import Message from '../models/Message';
import UserVocab from '../models/UserVocab';
import mongoose from 'mongoose';

import { reviewLesson } from '../services/reviewLesson';


dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string)
      .then(() => { console.log("MongoDB connected successfully"); })
      .catch((err: Error) => { console.error("MongoDB connection error:", err); });

const model = new ChatOpenAI({
    model: 'gpt-4.1'
});



(async () => {
    try {
        const threadId = '6847881a75b6ed847a6fa765';
        const userId = '68381ffdfb1dda73abd84266'
        const vocabBeforeLesson = await UserVocab.find({userId: userId});
        const rawThreadMessages = await Message.find({ threadId: threadId })
            .sort({ timestamp: 1 })
            .limit(10);
        const chatHistory = rawThreadMessages
            .map((message) => `At ${message.timestamp} from ${message.sender} : ${message.text}`)
            .join("\n");

        console.log('done prepare data');

        const message = `
        UserId is: ${userId}

        Vocab before thread: ${vocabBeforeLesson}

        Chat thread:
        ${chatHistory}
        `;
        const response = await model.invoke([
            new SystemMessage(closeLessonInstruction),
            new HumanMessage(message)
        ]);

        console.log('response is ', response)
    } catch (error) {
        console.log('cant invoke model ', error)
    } finally {
        await mongoose.disconnect();
    }

})();


