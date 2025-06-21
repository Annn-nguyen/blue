import mongoose, { Document, Schema} from "mongoose";

export interface ISong extends Document {
    title: String,
    artist: String,
    lyrics: String,
    language: String,
    searchKeyword: String,
};

const songSchema = new Schema<ISong>({
    title: {type: String, required: true},
    artist: {type: String, required: true},
    lyrics: {type: String, required: true},
    language: {type: String, enum:["English", "Chinese", "Japanese", "Korean",  "French", "Italian"], required: true },
    searchKeyword: {type: String, default: ''}
});

export default mongoose.model<ISong>('Song', songSchema);