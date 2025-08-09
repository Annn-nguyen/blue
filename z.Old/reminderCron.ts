import cron from 'node-cron';
import Reminder from '../models/Reminder';
import GraphApi from '../services/graph-api';
import User from '../models/User';
import Thread from '../models/Thread';
import Message from '../models/Message';

import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage } from '@langchain/core/messages';

import dotenv from 'dotenv';

dotenv.config();

const model = new ChatOpenAI({
    model: 'gpt-4o-mini'
})

async function sendReminder(psid: string): Promise<void> {
    try {
        // find the latest thread with some material
        const thread = await Thread.findOne({ psid })
            .sort({ startTime: -1 })
            .exec()

        //find the open thread 
        let currentThreadId = '';
        let currentThread = await Thread.findOne({ psid: psid, status: 'open' });
        if (!currentThread) {
            currentThread = await Thread.create({
                psid: psid, status: 'open', startTime: new Date()
            })
        }

        currentThreadId = currentThread._id.toString();
        console.log('current thread is ', currentThreadId);

        let reminderMessage = `Hi, this is your daily reminder to practice with Gentle Comet! Continue your lesson or close lesson AND start a new one.`;

        // generate quiz 
        if (thread && thread.material && thread.material.trim() !== '') {
            const lyrics = thread.material;
            const topic = thread.topic || 'vocabulary';

            const prompt = `
            Generate a vocabulary quiz for your student based on the lyrics provided. The quiz must be less than 200 words AND open ended and have structure as follows:
            - A greeting: come up with a friendly reminder greeting to the student.
            - 1 part ask about a word/phrase in the lyrics, quote the line (adding 2 hints).
            - 1 part ask student to make a sentence with it 
            Add cute emoji to the message.
            Lyrics:
            ${topic}
            ${lyrics}

            Example of the quiz:
            Hey hey, this is your daily reminder from Gentle Comet! Let practice vocabulary in the song Tsubame by Yoasobi!
            1. What does "tsubasa" (翼) means in the line "Tsubasa o hatameka sete"? (hint: it is a noun, hint 2: it is related to flying)
            2. Can you make a sentence with "tsubasa"?
            `

            const response = await model.invoke([
                new SystemMessage(prompt)
            ]);
            console.log('model response is ', response);

            if (response.content && response.content !== '') {
                // send the message to user 
                reminderMessage = response.content;
            }


        }

        // send the reminder message and save to database

        const requestBody = {
            recipient: { id: psid },
            message: { text: reminderMessage }
        };
        console.log('request body is ', requestBody);

        await GraphApi.callSendApi(requestBody);
        console.log('reminder message sent to user ', psid);

        await Message.create({
            threadId: currentThreadId,
            sender: 'bot',
            userId: psid,
            text: reminderMessage,
        });
        console.log('reminder message saved to database');
    } catch (error) {
        console.log('Error generating the reminder ', error);
    }
}

// this run at 7h00 every day GMT+7

cron.schedule('00 7 * * * ', async () => {
    console.log('Running daily reminder job at 7h...');

    // find all user with active reminders 
    const reminders = await Reminder.find({ status: 'on' });
    console.log('list of reminder found ', reminders.toString())

    for (const reminder of reminders) {
        const user = await User.findOne({ psid: reminder.psid });

        if (!user) continue;

        // send a simple reminder message 
        await sendReminder(reminder.psid);

    }
}, {
    timezone: "Asia/Bangkok"
}
);

cron.schedule('00 19 * * * ', async () => {
    console.log('Running daily reminder job at 19h...');

    // find all user with active reminders 
    const reminders = await Reminder.find({ status: 'on' });
    console.log('list of reminder found ', reminders.toString())

    for (const reminder of reminders) {
        const user = await User.findOne({ psid: reminder.psid });

        if (!user) continue;

        // send a simple reminder message 
        await sendReminder(reminder.psid);

    }
}, {
    timezone: "Asia/Bangkok"
}
)