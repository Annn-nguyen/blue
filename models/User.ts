import mongoose , { Document, Schema } from "mongoose";

export interface IUser extends Document {
    firstName? : String;
    psid? : String;
    locale? : String;
};

const userSchema = new Schema<IUser>({
    firstName: { type: String },
    psid: { type: String},
    locale: { type: String },
});

export default mongoose.model <IUser>('User', userSchema);