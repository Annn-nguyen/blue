import mongoose from "mongoose";
import Thread from "../models/Thread";
import UserVocab from "../models/UserVocab";
import Message from "../models/Message";

import dotenv from "dotenv";

dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string)
    .then(() => console.log('CONNECT MONGODB SUCESSFULLY!'))
    .catch((err: Error) => {console.log('fail to connect db ',err)});

try {
    const userId = "68381ffdfb1dda73abd84266";
    const response = await UserVocab.find({userId: userId});
    console.log('Vocabs of user ', userId, ' is: ', response);
} catch (error) {
    console.log('Error when getting the vocab ', error)
}

// try {
//     const testThreadId = '6847881a75b6ed847a6fa765'
//     const messages = await Message.find({threadId: testThreadId});
//     // const messagesCount = await Message.countDocuments({threadId: testThreadId});
//     console.log(messages);
//     console.log('Number of results found: ', messages.length);
// } catch (error) {
//     console.log('some error happened ', error);
// }

