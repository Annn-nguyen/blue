import { Reminder, IReminder } from "../models/Reminder";

export default class ReminderService {
    static async setReminder(psid: string, status: string) : Promise<void> {
        try {
            // upsert reminder record for selected user
            const existingReminder = await Reminder.findOne({psid});

            if (existingReminder) {
                // update reminder status
                await Reminder.findByIdAndUpdate(existingReminder._id, {
                    status
                });
                console.log('Update reminder!');
                
            } else {
                // create new
                const newReminder = await Reminder.create({
                    psid,
                    status,
                    time: '07:30',
                    timezone: 'Asia/Bangkok'
                });
                console.log('New reminder created ', newReminder);
            }


        } catch(err) {
            console.error('Error while add reminder for user', err)
        }
    }
}