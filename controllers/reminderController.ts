import LLMService from "../services/llmService";
import { Thread, IThread } from "../models/Thread";
import MessageService from "../services/messageService";
import ThreadService from "../services/threadService";

export default class ReminderController {
    static async genQuiz(psid: string): Promise<void> {
        try {
            // find the latest thread to get the lyrics
            const thread = await Thread.findOne({ psid })
                .sort({ startTime: -1 })
                .exec();
            
            //find the open thread 
            const currentThread = await ThreadService.findOrCreateOpenThread(psid);
            const currentThreadId = currentThread?._id as string;

            console.log('Current Thread is ', currentThreadId);

            // gen quiz
            let lyrics = (thread && thread.material) ? thread.material as string : 'No lyrics found';
            
            const quiz = await LLMService.genQuiz(lyrics);
            console.log('Quiz generated: ', quiz);

            // send reminder 
            if (quiz && quiz !== '') {
                MessageService.sendMessage(quiz, currentThreadId, psid);
            };
        } catch(error) {
            console.log('Error ')
        }
    }

}