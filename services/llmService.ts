import dotenv from 'dotenv';
import { IThread } from '../models/Thread';
import { mainInstruction, extractWordsInstruction, closeLessonInstruction } from './instruction';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, AIMessage, ToolMessage, HumanMessage, BaseMessage } from '@langchain/core/messages';

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { fetchLyricsTool, fetchLyrics} from '../utilities/fetchLyrics';
import { updateLyricsFromUserInput, updateLyricsFromUserInputTool } from '../utilities/updateLyricsFromUserInput';
import { IUser } from '../models/User';
import { response } from 'express';



dotenv.config();


export default class LLMService {
    static async generateResponse(chatHistory: string, thread: IThread, user: IUser):Promise<string> {
        // initate model with its tools
        const model = new ChatOpenAI({ model : 'gpt-4.1-mini'});
        const tools = [fetchLyricsTool, updateLyricsFromUserInputTool]
        const modelWithTool = model.bindTools(tools);


        // prepare the prompt
        const userVocab = thread?.userVocab ? thread.userVocab : 'No data available';
        const lyrics = thread?.material ? thread.material : 'No data available'

        const instruction = mainInstruction;        

        const context = `
# *Context is:*
*threadId*: ${thread._id}
\n
*Chat history:*
${chatHistory}
\n
*Lyrics*:
${lyrics}
\n
*User Vocab:* 
${userVocab}
`;
        console.log(`Instruction prep: `, instruction);
        console.log(`Context prep: `, context);
        const processWithTools = async (messages: BaseMessage[]) : Promise<BaseMessage[]> => {
            console.log()
            try {
            // run the prompt
            const response = await modelWithTool.invoke(messages);
            console.log('Model response is: ', response);

            // handle tool message until we got an acceptable response to user
            if (response.tool_calls?.length) {
                // setup the toolMessage here
                const toolMessages : BaseMessage[] = [response];
                console.log('Initialize tool message');

                // process each tool call 
                for (const toolCall of response.tool_calls) {
                    if (toolCall.name === 'fetchLyricsTool') {
                        const result = await fetchLyricsTool.invoke({
                            artist: toolCall.args.artist,
                            title: toolCall.args.title,
                            searchKeywords: toolCall.args.searchKeywords,
                            language: toolCall.args.language,
                            threadId: toolCall.args.threadId,
                            userId: toolCall.args.userId
                        })

                        // craft tool response 
                        const toolMessage = new ToolMessage({
                            content: result,
                            name : toolCall.name,
                            tool_call_id: toolCall.id!,
                        })
                        console.log('Tool result of fetchLyricsTool: ', result);

                        // append to messages
                        toolMessages.push(toolMessage);
                        console.log('APPENDED tool result to message thread');

                    } else if(toolCall.name === 'updateLyricsFromUserInputTool') {
                        const result = await updateLyricsFromUserInputTool.invoke({
                            artist: toolCall.args.artist,
                            title: toolCall.args.title,
                            searchKeywords: toolCall.args.searchKeywords,
                            language: toolCall.args.language,
                            lyrics: toolCall.args.lyrics,
                            threadId: toolCall.args.threadId,
                            userId: toolCall.args.userId
                        })

                        // craft tool response 
                        const toolMessage = new ToolMessage({
                            content: result,
                            name : toolCall.name,
                            tool_call_id: toolCall.id!,
                        })
                        console.log('TOOL RESULT of updateLyricsFromUserInputTool: ', result);

                        // append to messages
                        toolMessages.push(toolMessage);
                        console.log('APPENDED tool result to message thread');

                    }
                }

                // recursive this process 
                return await processWithTools([...messages, ...toolMessages]);
            } 
            else {
                return [response]; 
                
            }
            
            } catch(error) {
                console.error('Error while generate response: ', error);
                return [];
            }

        
        

        }

        // running the processWithTools and return the content of the text msg LLM returned 
        const messages : BaseMessage[] = [new SystemMessage(instruction), new HumanMessage(context)];
        const result = await processWithTools(messages);

        return result[0]?.content.toString();
        
    };

    

    static async extractVocab(prompt: string): Promise<string> {
        // build the prompt

        // run the prompt 

        return ''

    };

    static async breakdownVocab(text: string): Promise<string[]|null> {
        const model = new ChatOpenAI({
                model: 'gpt-4.1-mini'
            });
        
            const outputSchema = z.object({
                words: z.array(z.string()).describe('list of extracted words')
            });
        
            try {
                const response = await model.withStructuredOutput(outputSchema).invoke([new SystemMessage(extractWordsInstruction), new HumanMessage(text)]);
                console.log('Extracted words: ', response);
                if ('words' in response) {
                    return response.words;
                } else {
                    return null;
                }
            } catch(error) {
                console.log('Error while extracting words ', error);
                return null;
            }
    }

    static async reviewThread(prompt: string): Promise<string> {
        return '';
    }

    static async generateReminder(prompt: string): Promise<string> {
        return '';
    }
}