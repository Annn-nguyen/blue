import Message, {IMessage} from "../../models/Message";
import Thread from "../../models/Thread";

// Create a new message and saved to database

export async function createMessage(threadId: string, sender: string, userId: string, text: string): Promise<IMessage | null> {
    try {
    // Create the message object
    const message = new Message({
        threadId: threadId,
        sender: sender,
        userId: userId,
        text: text,
    });

    // Save the message to the database
    const savedMessage = await message.save();
    console.log("Message saved:", savedMessage);

    // Update the thread to include the new message
    await Thread.findByIdAndUpdate(
        { _id: threadId },
        { $push: { messages: savedMessage._id } },
    );

    return savedMessage;
} catch (error) {
    console.error("Error creating message:", error);
    return null;
}};

