import { Thread, IThread } from "../models/Thread";

export default class ThreadService {
    static async findThreadForReminder(psid: string): Promise<void> {
        
    }

    static async findOrCreateOpenThread(psid: string) : Promise<IThread|null> {
        // search open thread of the user 
        let thread = {} as any;

        try {
            thread = await Thread.findOne({psid: psid, status: 'open'});

            if (thread) {
                console.log('Found the existing thread for user', thread._id);
                return thread;
            } else {
                console.log('No open thread, create a new one for user')
                thread = await Thread.create({
                    psid
                });
                console.log('New thread created', thread._id);
                return thread;

            }
        } catch(err) {
            console.log(`Error in find or create open thread for psid ${psid}: ${err} `)
            return null;
        }
    }

    static async closeThread(threadId: string): Promise<void>{

        // this func is used when user wants to close lesson
        try {
            // update status of thread to close
            await Thread.findByIdAndUpdate(threadId, {
                status: 'closed'
            })
            console.log('FAILED to update thread status to CLOSED')

            // review thread to update Vocab etc 
            
        } catch(error) {
            console.error('Error while closing thread');
        }

    }

}