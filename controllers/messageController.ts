// import all necessary files

import GraphApi from "../services/graph-api";
import LLMService from "../services/llmService";
import MessageService from "../services/messageService";
import ThreadService from "../services/threadService";
import { Thread, IThread } from "../models/Thread";

export default class MessageController {
    static async handleMessage(webhookEvent: any, user: any):Promise<void>{
        try {
            const psid = user.psid;
            // setup thread, save msg

            const currentThread = await ThreadService.findOrCreateOpenThread(user.psid);
            if (!currentThread) {
                // need to send some error message to user 
                return;
            }
            const threadId = currentThread ? (currentThread._id as any).toString() : null;
            const vocabBeforeLesson = currentThread ? (currentThread.userVocab as string) : '';

            await MessageService.saveUserMessage(threadId, psid, webhookEvent.message.text);

            // check whether it is closeThread
            const closeLessonKeywords = ['close lesson', 'end lesson', 'finish lesson', 'stop lesson'];
            if (closeLessonKeywords.some(keyword => webhookEvent.message.text.toLowerCase().includes(keyword))) {
                console.log('Running close thread');
                await this.closeThread(threadId, vocabBeforeLesson, user);
                return;
            }
            // get chathistory as text
            const chatHistory = await MessageService.getChatMsgAsText(threadId,30);
            
            // generate response by llm
            let message = await LLMService.generateResponse(chatHistory, currentThread, user);

            if (message !== '') {
                // typing off and reply to user
                await GraphApi.sendTyping(psid, 'off');

                console.log('Typing off SENT to user');

                await MessageService.sendMessage(message, threadId, psid);
                console.log('Message SENT and SAVED');
            } else {
                console.log('No response from LLM to respond to user');
            }


            


        } catch(error) { 
            console.error(`Error in handle message ${error}`);
        }

        
    }
    
    private static async closeThread(threadId: string, vocabBeforeLesson: string, user: any):Promise<void>{
        try {
            // send message to user
            const closeMsg = "Yes, I will close the lesson and update your progress (lesson history and vocabulary) in the system. You can start a new lesson anytime by sending me a message.";
            await MessageService.sendMessage(closeMsg, threadId, user.psid);
            
            console.log('SEND CLOSED MSG to user');

            // update thread status to closed
            await Thread.findByIdAndUpdate(threadId, {
                status: 'closed'
            });
            console.log('Thread status CLOSED!');

            // review the existing thread 
            let vocabUpdate = '';
            
            // retrieve all thread message 
            const allMessages = await MessageService.getChatMsg(threadId);

            const pageSize = 10;
            let page = 0;

            // apply reviewPart for each page
            while (page*pageSize < allMessages.length) {

                const batchMessages = allMessages.slice(page*pageSize, (page+1)*pageSize);
                //prep chat as text
                const messages = batchMessages
                    .map((message) => `At ${message.timestamp} from ${message.sender}: ${message.text}`)
                    .join('\n');

                // run review
                console.log('RUNNING reviewPart');
                const vocabAdded = await LLMService.reviewPart(messages, vocabBeforeLesson, user._id);
                
                vocabUpdate = vocabUpdate + vocabAdded;
                console.log('REVIEWED successfully for page ', page);
                page++;
            }

            // update thread.vocabUpdate
            await Thread.updateOne(
                {_id: threadId},
                {$set: { vocabUpdate: vocabUpdate}}
            );

            console.log('DONE reviewThread');

        } catch(error) {
            console.error('Error while closing thread');
        }
    }

}
