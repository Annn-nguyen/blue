import mongoose from "mongoose";
import Thread from "../models/Thread";
import UserVocab from "../models/UserVocab";
import { fetchLyrics } from "../utilities/fetchLyrics";

import dotenv from "dotenv";

dotenv.config();
mongoose.connect(process.env.MONGODB_URI as string)
    .then(() => console.log('CONNECT MONGODB SUCESSFULLY!'))
    .catch((err: Error) => {console.log('fail to connect db ',err)});

(async () => {
    try {
        const title = 'remember summer days';
        const artist = 'anri';
        const searchKeyword = 'remember summer days';

        const lyrics = await fetchLyrics(title, artist, searchKeyword);
        console.log('fetch lyrics result for ', title, ' by ', artist, ': ', lyrics);

    } catch (error) {
        console.log('test error: ', error)
    } finally {
        await mongoose.disconnect();
    }
})();
