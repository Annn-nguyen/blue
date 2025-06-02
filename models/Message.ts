import mongoose, { Schema, model } from "mongoose";

export interface IMessage extends Document {
    threadId?: String;
    sender : String;
    userId?: String;
    text: String;
    timestamp: Date;
};

const messageSchema = new Schema<IMessage>({
    threadId: {type: String},
    sender: {type: String, enum: ['user', 'bot'], required: true},
    userId: {type: String},
    text: { type: String, required: true},
    timestamp : { type: Date, required: true, default : Date.now }
});

export default mongoose.model<IMessage>('Message', messageSchema);;