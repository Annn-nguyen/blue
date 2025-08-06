import config from '../services/config';
import GraphApi from '../services/graph-api';
import dotenv from 'dotenv'

dotenv.config();

export default class MessengerPlatform {
    static async verifyWebhook(mode: string, token: string, challenge: string): Promise<string> {
        if (mode && token) {
            if (mode === 'subscribe' && token === config.verifyToken) {
                // response with the challenge token from the request
                console.log('WEBHOOK_VERIFIED');
                return challenge;
            } else {
                console.error('Failed verification. Mode and token do not match.');
                throw new Error('Failed verification. Mode and token do not match.');
            }
            
        }
        return '';
    }

    static async setGetStarted() : Promise<void> {
        try {
            await GraphApi.setGetStarted();
            console.log('Set get started successfully');
        } catch(error) {
            console.error('Set get started unsuccessfully', error);
        }
    }

    static async setPersistentMenu(): Promise<void> {
        const menuData = {
            persistent_menu: [
                {
                    locale: 'default',
                    composer_input_disabled: false,
                    call_to_actions: [
                        {
                            type: 'postback',
                            title: 'Remind Daily Practice',
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
            // set persistent menu
            const result = await GraphApi.setPersistentMenu(menuData);
            result.json(result);
            console.log('Set persistent menu successfully')
        } catch(error) {
            console.error('Set persistent menu unsuccessfully ', error);
        }
    }
}