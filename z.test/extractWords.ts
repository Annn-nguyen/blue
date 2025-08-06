import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { extractWordsInstruction } from "../services/instruction";
import UserVocab from "../models/UserVocab";
import Message from "../models/Message";
import Thread from "../models/Thread";
import mongoose from "mongoose";
import {z} from "zod" ;

import dotenv from "dotenv";
import User from "../models/User";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string)
      .then(() => { console.log("MongoDB connected successfully"); })
      .catch((err: Error) => { console.error("MongoDB connection error:", err); });
      

const model = new ChatOpenAI({
    modelName: "gpt-4o-mini"
})// or any other model you are using

const extractWordsFromMaterial = async (material: string): Promise<any[]> => {
        // Use the extractWordsInstruction to extract words from the material. the output of the AI is already an array of words.
        const outputSchema = z.object({
                    words: z.array(z.string()).describe("list of word extracted"),
                })
        
        try { 
            const response = await model.withStructuredOutput(outputSchema).invoke([new SystemMessage(extractWordsInstruction), new AIMessage(material)]);
            console.log("Extracted words response:", response);

            if ("words" in response) {
                return response.words;
            }
        } catch (error) {
            console.error("Error extracting words from material:", error);

        }
        console.log("other case, return []")
    return [];
}

const getUserVocab = async (wordList: string[], userId : string) => {
        
        // find the words in UserVocab that match the wordlist provided
        const response =  await UserVocab.find({
            userId, word: { $in: wordList}
        });
        console.log('Result found: ', response)
        
        const known = []
        const introduced = []
        for (const item of response) {
            if (item.status === "known") {
                known.push(item.word)
            } 
            if (item.status === "introduced") {
                introduced.push(item.word)
            }
        }
        console.log('Known raw list ', known);
        console.log("Introduced raw list ", introduced);
        const knownString = known.length > 0 ? known.join(","): "none";
        const introducedString = introduced.length > 0 ? introduced.join(",") : "none";

        const final = `
        Known words: ${knownString}
        Introduced words: ${introducedString}`

        console.log("final result ", final);

        return final
        
    }

// Example usage
(async () => {
    // const material = "涙流すことすら無いまま\n過ごした日々の痕一つも残さずに";
    // const words = await extractWordsFromMaterial(material);
    // console.log("Extracted words:", words);
    
    try {
        const testThreadId = '6847881a75b6ed847a6fa765';
        const testUserId = '68381ffdfb1dda73abd84266';
        const thread = await Thread.findById(testThreadId);

        const material: string = typeof thread?.material === "string" ? thread.material : "";
        if (material !== "") {
            const wordList = await extractWordsFromMaterial(material);
            console.log("Extracted word list:", wordList);

            const userVocabBeforeLesson = await getUserVocab(wordList, testUserId);
            console.log('userVocabBeforeLesson is ', userVocabBeforeLesson);
        } else {
            console.log('false to extract material');
        }

    } catch (error) {
        console.log('fail to create dummy data', error)
    }  finally {
            await mongoose.disconnect();
    };
    
}
)();
