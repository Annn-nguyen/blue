import mongoose from "mongoose";
import Thread from "../models/Thread";
import UserVocab from "../models/UserVocab";

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