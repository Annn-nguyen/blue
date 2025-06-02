import Thread , {IThread} from "../../models/Thread";
import Message, {IMessage} from "../../models/Message";

// Create a new thread and save it to database

export async function createThread( userId: string, topic?: string) : Promise <IThread | null> {
    try {
        const thread = new Thread({
            userId: userId,
            topic: topic,
        });

        const savedThread = await thread.save();
        return savedThread;
    } catch (error) {
        console.error("Error creating thread:", error);
        return null;
    }
};

// Update a thread status or topic
export async function updateThread(threadId: string, status?: string, topic?: string) : Promise<IThread | null> {
    try {
        const updatedThread = await Thread.findByIdAndUpdate(
            { _id: threadId },
            { $set: { status: status, topic: topic } },
        );
        return updatedThread;
    } catch (error) {
        console.error("Error updating thread:", error);
        return null;
    }
}

// Get a thread by ID
export async function getThreadById(threadId: string) : Promise<IThread | null> {
    try {
        const thread = await Thread.findById(threadId).populate('messages');
        return thread;
    } catch (error) {
        console.error("Error getting thread:", error);
        return null;
    }
};

// Find threads by userId
export async function findThreadsByUserId(
    userId: string,
    page: number = 1,
    limit: number = 10
): Promise<IThread[] | null> {
    try {
        const threads = await Thread.find({ userId: userId })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);
        return threads;
    } catch (error) {
        console.error("Error finding threads:", error);
        return null;
    }
}