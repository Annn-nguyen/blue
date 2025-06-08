import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { extractWordsInstruction } from "../services/instruction";
import UserVocab from "../models/UserVocab";
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
export { extractWordsFromMaterial };

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
        await UserVocab.create(
        {
        word: "涙",
        status: "known",
        note: "namida",
        meaning: "tear (as in crying)",
        language: "Japanese",
        userId: "68381ffdfb1dda73abd84266"
    },
    {
        word: "事",
        status: "known",
        note: "koto",
        meaning: "thing, matter",
        language: "Japanese",
        userId: "68381ffdfb1dda73abd84266"
    },
    {
        word: "後",
        status: "known",
        note: "ato",
        meaning: "after, behind",
        language: "Japanese",
        userId: "68381ffdfb1dda73abd84266"
    },
    {
        word: "一人",
        status: "known",
        note: "hitori",
        meaning: "one person, alone",
        language: "Japanese",
        userId: "68381ffdfb1dda73abd84266"
    },
    {
        word: "誰か",
        status: "known",
        note: "dareka",
        meaning: "someone, anyone",
        language: "Japanese",
        userId: "68381ffdfb1dda73abd84266"
    },
    {
        word: "二人",
        status: "known",
        note: "futari",
        meaning: "two people",
        language: "Japanese",
        userId: "68381ffdfb1dda73abd84266"
    },
    {
        word: "部屋",
        status: "known",
        note: "heya",
        meaning: "room",
        language: "Japanese",
        userId: "68381ffdfb1dda73abd84266"
    },
    {
        word: "悪い",
        status: "known",
        note: "warui",
        meaning: "bad, poor, undesirable",
        language: "Japanese",
        userId: "68381ffdfb1dda73abd84266"
    },
    {
        word: "多分",
        status: "known",
        note: "tabun",
        meaning: "probably, perhaps",
        language: "Japanese",
        userId: "68381ffdfb1dda73abd84266"
    }
    );
    console.log('create dummy data successfully')
    } catch (error) {
        console.log('fail to create dummy data', error)
    };
    
//     const result = getUserVocab(words, "1")
}
)();
