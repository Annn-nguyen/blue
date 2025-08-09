import cron from 'node-cron';
import ReminderController  from '../controllers/reminderController';
import dotenv from 'dotenv';
import config from '../services/config';
import { Reminder, IReminder } from '../models/Reminder';



dotenv.config()

export const startReminderCron = () => {
    // schedule logic at 7AM and 7PM daily
    cron.schedule('0 7 * * *', async () => {
        console.log('Start cron 7AM');

        try {
            // find all the user with reminder enabled 
            const usersToRemind = await Reminder.find({status : 'on'});
            console.log('Number of user to remind ', usersToRemind.length.toString());

            if (usersToRemind) {
                for (const user of usersToRemind) {
                await ReminderController.genQuiz(user.psid as string);

            }
            }
            
        } catch(error) {
            console.error('Error while running Reminder cronjobs');
        }
        
    },{
    timezone: "Asia/Bangkok"
    }
    );

    cron.schedule('41 17 * * *', async () => {
        console.log('Start cron 7PM');

        try {
            // find all the user with reminder enabled 
            const usersToRemind = await Reminder.find({status : 'on'});
            console.log('Number of user to remind ', usersToRemind.length.toString());

            if (usersToRemind) {
                for (const user of usersToRemind) {
                await ReminderController.genQuiz(user.psid as string);

            }
            }
            
        } catch(error) {
            console.error('Error while running Reminder cronjobs');
        }
        
    },{
    timezone: "Asia/Bangkok"
    }
    )
}