import { Request, Response } from 'express';
import MessageController from './messageController';
import PostbackController from './postbackController';

import UserService from '../services/userService';
import GraphApi from '../services/graph-api';
import dotenv from 'dotenv';
import config from '../services/config';

dotenv.config();

export default class WebhookController {
    static async verifyWebhook(req: Request, res : Response):Promise<void>{
        const mode = req.query['hub.mode'];
        const verifyToken = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        
        if (mode && verifyToken) {
            // check if verifyToken is correct
            if (mode === 'subscribe' && verifyToken === config.verifyToken) {
                console.log('WEBHOOK VERIFIED');
                res.status(200).send(challenge);
            } else {
                console.log('VERIFY TOKEN NOT MATCH');
                res.status(403);
            }
        }
    };

    static async setPersistentMenu(req: Request, res: Response) : Promise<void> {
        const menuData = {
            persistent_menu: [
                {
                    locale: 'default',
                    composer_input_disabled: false,
                    call_to_actions: [
                        {
                            type: 'postback',
                            title: 'Activate daily reminder',
                            payload: 'SET_DAILY_REMINDER'
                        },
                        {
                            type: 'web_url',
                            title: 'Privacy Policy',
                            url: 'https://starpy.wordpress.com/2025/06/27/privacy-policy-for-blue-gentle-comet/',
                            webview_height_ratio: 'full'
                        }
                    ]
                }
            ]
        };

        try {
            // set get started
            const getStart = await GraphApi.setGetStarted();
            console.log('Set get started successfully');

            // set persistent menu 
            const result = await GraphApi.setPersistentMenu(menuData);
            res.json(result);
            console.log('Set persistent menu successfully');
        } catch(error: any) {
            res.status(500).json({error: error.message});
        }
    }

    
    static async handleWebhookEvent(req: Request, res: Response): Promise<void> {
        const body = req.body;
        const userService = new UserService();

        console.log(`WEBHOOK RECEIVED`);
        console.dir(body, {depth: null});

        // check if this is an event from a page subscription
        if (body.object === 'page') {
            res.status(200).send('EVENT RECEIVED');

            // iterate over each entry
            body.entry.forEach(async (entry: any) => {
                entry.messaging.forEach(async(webhookEvent: any) => {
                    // discard uninteresting events
                    if ('read' in webhookEvent) {
                        console.log('Receive a read event');
                        return;
                    } else if ('delivery' in webhookEvent) {
                        console.log('Receive a delivery event');
                        return;
                    } else if ('reaction' in webhookEvent) {
                        console.log('Receive a reaction event');
                        return;
                    } else if (webhookEvent.message && webhookEvent.message.is_echo) {
                        console.log('Receive a echo of our send');
                        return;
                    } else if ('message_edit' in webhookEvent) {
                        console.log('Receive a edit event');
                        return;
                    }
                    
                    // get user profile or create new 
                    const psid = webhookEvent.sender.id;
                    
                    // send typing
                    await GraphApi.sendTyping(psid, 'on');

                    const user = await userService.findOrCreatUser(psid);
                    

                    // based on type of event, route to the correct handler
                    if (webhookEvent.message.quick_reply && webhookEvent.message.quick_reply.payload) {
                        MessageController.handleQuickReplies(webhookEvent.message.quick_reply.payload,user)
                    }
                    else if (webhookEvent.message) {
                        MessageController.handleMessage(webhookEvent.message.text, user);
                    } else if (webhookEvent.postback) {
                        PostbackController.handlePostback(webhookEvent, user);
                    } else {
                        console.log('Other type of message that we do not handle');
                        return;
                    }

                })
            })
        }

        
    };
}