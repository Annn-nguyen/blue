import cron from 'node-cron';
import Reminder from '../models/Reminder';
import GraphApi from './graph-api';
import User from '../models/User';

// this run at 7h30 every day GMT+7

cron.schedule('30 7 * * * ', async() => {
    console.log('Running daily reminder job...');

    // find all user with active reminders 
    const reminders = await Reminder.find({status : 'on'});
    console.log('list of reminder found ', reminders.toString())

    for (const reminder of reminders) {
        const user = await User.findOne({psid: reminder.psid});

        if (!user) continue;

        // send a simple reminder message 
        const requestBody = {
            recipient : {id: reminder.psid},
            message: { text: "⏰ This is your daily reminder to continue your lesson with Gentle Comet :D (just a simple reminder first, no save to thread, no special logic hahahahaha!"}
        };

        await GraphApi.callSendApi(requestBody);

    }
}, {
    timezone : "Asia/Bangkok"
}
)