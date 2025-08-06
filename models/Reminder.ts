import mongoose,  {Document, Schema} from "mongoose";

export interface IReminder extends Document {
    psid: String,
    time: String,
    timezone: String
    status: String,
    createdAt: Date
}

const reminderSchema = new Schema<IReminder>({
    psid: {type: String, required: true},
    time: {type: String},
    timezone: {type: String},
    status: {type: String, enum:['on','off'], default:'on' },
    createdAt: {type: Date, required: true, default: Date.now}
});

export default mongoose.model<IReminder>('Reminder', reminderSchema);
