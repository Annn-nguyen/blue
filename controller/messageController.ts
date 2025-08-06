// import all necessary files

import { Message } from "../models/Message";
import GraphApi from "../services/graph-api";
import LLMService from "../services/llmService";
import MessageService from "../services/messageService";
import ThreadService from "../services/threadService";

export default class MessageController {
    static async handleMessage(webhookEvent: any, user: any):Promise<void>{
        try {
            // setup thread, save msg

            const currentThread = await ThreadService.findOrCreateOpenThread(user.psid);
            if (!currentThread) {
                // need to send some error message to user 
                return;
            }
            const threadId = currentThread ? (currentThread._id as any).toString() : null;
            await MessageService.saveUserMessage(threadId, user.psid, webhookEvent.message.text);

            // check whether it is closeThread
            const closeLessonKeywords = ['close lesson', 'end lesson', 'finish lesson', 'stop lesson'];
            if (closeLessonKeywords.some(keyword => webhookEvent.message.text.toLowerCase().includes(keyword))) {
                console.log('Running close thread');
                await this.closeThread(threadId, user);
                return;
            }
            // get chathistory as text
            const chatHistory = await MessageService.getChatMsgAsText(threadId,30);
            
            // generate response by llm
            let message = await LLMService.generateResponse(chatHistory, currentThread, user);

            if (message !== '') {
                // typing off and reply to user
                await GraphApi.sendTyping(user.psid, 'off');

                console.log('Send message to user')
                const requestBody = {
                    recipient: { id: user.psid },
                    message: { text: message },
                }

                const sent = await GraphApi.callSendApi(requestBody);
                
                // save msg to database
                if (sent) {
                    await MessageService.saveUserMessage(threadId, user._id, message);
                    console.log('Message sent to user successfully and saved to db')
                } else {
                    console.error('Failed to send message to user');
                }
            } else {
                console.log('No response from LLM to respond to user');
            }


            


        } catch(error) { 
            console.error(`Error in handle message ${error}`);
        }

        
    }
    
    private static async closeThread(threadId: string, user: any):Promise<void>{

    }

}
