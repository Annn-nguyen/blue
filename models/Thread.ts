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
};

const threadSchema = new Schema<IThread>({
    topic: {type: String},
    material: {type: String},
    userVocab: { type : String},
    userId: {type: String},
    psid: {type: String},
    status: {type: String, enum : ["open", "close"], required: true, default: "open"},
    startTime:{type: Date, default: Date.now  },
    messages: [{type: mongoose.Types.ObjectId, ref: 'Message'}]
});

export default mongoose.model<IThread>('Thread', threadSchema);