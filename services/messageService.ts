import dotenv from 'dotenv';
import {Message, IMessage} from '../models/Message';
import GraphApi from './graph-api';

export default class MessageService {
    static async sendMessage(message: string, threadId: string, psid: string, hasQuickReply: boolean = false):Promise<void>{
        try {
            let requestBody = {} as any;
            if (hasQuickReply === true) {
                requestBody = {
                    recipient: { id: psid },
                    message: { 
                            text: message, 
                            quick_replies: [
                                {
                                    content_type: "text",
                                    title: "Quiz me!",
                                    payload: "QUIZ_ME"
                                },
                                {
                                    content_type: "text",
                                    title: "Yes",
                                    payload: "YES"
                                },
                                {
                                    content_type: "text",
                                    title: "Continue w lyrics",
                                    payload: "CONTINUE_SONG"
                                }
                            ]
                        },
                };
            } else {
                requestBody = {
                    recipient: { id: psid },
                    message: { text: message },
                };
            }

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

    static async getChatMsg(threadId:string,size?:number,sortOrder:'asc' | 'desc' = 'asc'):Promise<IMessage[]>{
        let result : IMessage[] = [];
        
        try {
            if (size) {
                result = await Message.find({threadId})
                .limit(size)
                .sort({timestamp:sortOrder});
            } else {
                result = await Message.find({threadId})
                .sort({timestamp: sortOrder});
            }
        } catch(error) {
            console.error(`Error getting chat history ${error}`);
        }

        return result;
    }
    static async getChatMsgAsText(threadId:string, size?: number):Promise<string>{
        let result = '';

        try {
            const raw = await this.getChatMsg(threadId, size, 'desc');
            result = raw
                .reverse()
                .map((message) => `At ${message.timestamp} from ${message.sender}: ${message.text}`)
                .join('\n');
        } catch (err) {
            console.error(`Error while getting chatMsg ${err}`);
        }
        
        return result;
    }

}