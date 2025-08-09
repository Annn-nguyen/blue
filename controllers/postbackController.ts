import dotenv from 'dotenv';
import ThreadService from '../services/threadService';
import MessageService from '../services/messageService';
import ReminderService from '../services/reminderService';

export default class PostbackController {
    static async handlePostback(webhookEvent: any, user: any): Promise<void> {
        console.log('START handle postback');
        try {
            let message = 'Some error happened while handling your request'
            const psid = user.psid;
            const postbackPayload = webhookEvent.postback.payload;
            // find the thread
            const thread = await ThreadService.findOrCreateOpenThread(psid);
            const threadId = String(thread?._id);
            console.log('Thread found ', threadId);

            // save the message
            await MessageService.saveUserMessage(threadId, psid, postbackPayload);

            // handle logic for payload
            if (postbackPayload === 'GET_STARTED') {
                // send a simple help
                message = 'Hello welcome you to this gentle comet!';

            } else if (postbackPayload === 'SET_DAILY_REMINDER') {
                // update data and set msg
                await ReminderService.setReminder(psid, 'on');
                console.log('Set reminder successfully');

                message = 'Yes, I will send you reminder at 7am and 7pm (GMT 7) everyday!';

            }

            await MessageService.sendMessage(message, threadId, psid);
            console.log('Message sent and saved to db!');

        } catch(error) {
            console.error('Error while handling postback');
        }
 
    };
}