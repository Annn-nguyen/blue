import mongoose, { Document, Schema} from "mongoose";

const langValue = ["English", "Chinese", "Japanese", "Korean",  "French", "Italian"];

export interface IUserVocab extends Document {
    userId: string;
    word: string;
    note: string;
    meaning: string;
    language: string;
    status: string;
    createdAt: Date;
}

const userVocabSchema = new Schema<IUserVocab>({
    userId: { type: String, required: true },
    word: {type: String, required: true },
    note: {type: String},
    meaning: {type: String},
    language: { type: String, required: true, enum: langValue },
    status: {type: String, enum: ["introduced", "known"], required: true, default: "introduced"},
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IUserVocab>('UserVocab', userVocabSchema);
