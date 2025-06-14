import mongoose, { Document, Schema} from "mongoose";

export interface ISong extends Document {
    title: String,
    artist: String,
    lyrics: String,
    language: String,
    searchKeyword?: String,
};

const songSchema = new Schema<ISong>({
    title: {type: String},
    artist: {type: String},
    lyrics: {type: String},
    language: {type: String, enum:["English", "Chinese", "Japanese", "Korean",  "French", "Italian"] },
    searchKeyword: {type: String}
});

export default mongoose.model<ISong>('Song', songSchema);