import dotenv from 'dotenv';
import {Message, IMessage} from '../models/Message';
import GraphApi from './graph-api';

export default class MessageService {
    static async sendMessage(message: string, threadId: string, psid: string):Promise<void>{
        try {
            const requestBody = {
                    recipient: { id: psid },
                    message: { text: message },
            };
            const sendResult = await GraphApi.callSendApi(requestBody);

            // save bot msg
            if (sendResult) {
                await this.saveBotMessage(threadId, message);
            }
            console.log('Bot msg sent AND saved!')

        } catch(error) {
            console.error('Error while sending message!')
        }
    };

    static async saveUserMessage(threadId: string, userId: string, text: string):Promise<boolean>{
        let result = false;
        
        // saving the message to database
        try {
            console.log('Saving user message');
            const newMessage = await Message.create({
                threadId,
                sender : 'user',
                userId,
                text
            });
            console.log('User message saved!', JSON.stringify(newMessage));
        } catch(error) {
            console.error(`Error when saving user message ${error}`);
        }

        return result;
    }

    static async saveBotMessage(threadId: string, text: string):Promise<boolean>{
        let result = false;
        
        // saving the message to database
        try {
            console.log('Saving bot message');
            const newMessage = await Message.create({
                threadId,
                sender : 'bot',
                text
            });
            console.log('Bot message saved!',JSON.stringify(newMessage))
        } catch(error) {
            console.error(`Error when saving bot message ${error}`);
        }

        return result;
    }

    static async getChatMsg(threadId:string,size?:number):Promise<IMessage[]>{
        let result : IMessage[] = [];

        try {
            if (size) {
                result = await Message.find({threadId})
                .limit(size)
                .sort({timestamp:1});
            } else {
                result = await Message.find({threadId})
                .sort({timestamp: 1});
            }
        } catch(error) {
            console.error(`Error getting chat history ${error}`);
        }

        return result;
    }
    static async getChatMsgAsText(threadId:string, size?: number):Promise<string>{
        let result = '';

        try {
            const raw = await this.getChatMsg(threadId, size);
            result = raw
                .map((message) => `At ${message.timestamp} from ${message.sender}: ${message.text}`)
                .join('\n');
        } catch (err) {
            console.error(`Error whil getting chatMsg ${err}`);
        }
        
        return result;
    }

}