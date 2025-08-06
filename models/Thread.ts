import mongoose, { Document, Schema} from "mongoose";

export interface IThread extends Document {
    topic? : String;
    material? : String;
    userVocab? : String;
    userId? : String;
    psid? : String;
    status: String;
    startTime? : Date;
    messages? : mongoose.Types.ObjectId[];
    vocabUpdate?: String; // to store the vocab update result after closing the lesson
};

const threadSchema = new Schema<IThread>({
    topic: {type: String},
    material: {type: String},
    userVocab: { type : String},
    userId: {type: String},
    psid: {type: String},
    status: {type: String, enum : ["open", "closed"], required: true, default: "open"},
    startTime:{type: Date, default: Date.now  },
    messages: [{type: mongoose.Types.ObjectId, ref: 'Message'}],
    vocabUpdate: {type: String} 
});

export const Thread =  mongoose.model<IThread>('Thread', threadSchema);