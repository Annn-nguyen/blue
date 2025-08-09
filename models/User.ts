import mongoose , { Document, Schema } from "mongoose";

export interface IUser extends Document {
    firstName? : String;
    psid? : String;
    locale? : String;
    createdAt: Date
};

const userSchema = new Schema<IUser>({
    firstName: { type: String },
    psid: { type: String},
    locale: { type: String },
    createdAt: {type: Date, required: true, default: Date.now()}
});

export const User = mongoose.model <IUser>('User', userSchema);