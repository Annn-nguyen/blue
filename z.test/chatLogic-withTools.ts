import { z } from "zod";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { END, START, StateGraph, Annotation, Command, messagesStateReducer, MemorySaver, InMemoryStore } from "@langchain/langgraph";
import { AzureChatOpenAI } from "@langchain/openai";
import { AIMessage, BaseMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

const inMemoryStore = new InMemoryStore();
const checkpointer = new MemorySaver();

const AppState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: messagesStateReducer,
        default: () => [],
    }),
});

const tavilyTool = new TavilySearchResults({ maxResults: 3 });

const packingGuideSchema = z.object({
    destination: z.string().describe("The destination to pack for"),
    duration: z.string().describe("Duration of the trip"),
    climate: z.string().describe("Expected climate during the trip"),
    activities: z.array(z.string()).describe("Planned activities during the trip"),
    guide: z.string().describe("Detailed packing guide with recommendations")
});

type PackingGuideSchema = z.infer<typeof packingGuideSchema>;

const packingTool = {
    name: "packingGuide",
    description: `
        Provide a packing guide based on the destination and travel duration.
        Consider the climate, activities, and cultural requirements of the destination.
    `,
    schema: packingGuideSchema,
    invoke: async (input: PackingGuideSchema) => {
        return {
            content: `Packing Guide for ${input.destination}:\n\nClimate: ${input.climate}\nDuration: ${input.duration}\nActivities: ${input.activities.join(', ')}\n\n${input.guide}`
        }
    //const User = User.findbyId(input.userId); User [fieldName = input.fieldName] = input.value; await User.save();
    }
} as const;

const travelAdvisor = async (state: typeof AppState.State) => {
    const model = new AzureChatOpenAI({ model: "gpt-4o" });

    const possibleDestinations = [END, "flightAgent", "hotelAdvisor"] as const;

    const routingTool = {
        name: "route",
        description: `
            Select the next agent to call.
            If you need flight booking assistance, go to 'flight_agent' for help.
            If you need hotel recommendations, go to 'hotel_advisor' for help.
            If user finished their question, return '__end__'.
            ONLY use this tool if no other tool can provide the answer.
        `,
        schema: z.object({
            next: z.enum(possibleDestinations),
            reason: z.string().describe("Reason for selecting the next agent"),
        }),
    }

    const modelWithTools = model.bindTools([tavilyTool, routingTool, packingTool]);

    const instruction = `
        You are a general travel expert that can recommend travel destinations (e.g. countries, cities, etc).
        You can provide sightseeing recommendations and information about attractions.

        You may use the Tavily search engine to search the web for important information.
        You may use the 'packingGuide' tool to provide packing guides.
        You may use the 'route' tool to select the next agent to call. ONLY use the tool 'route' if no other tool is applicable.

        Never mention other agents by name.
    `;

    const messages = [
        new SystemMessage({ content: instruction }),
        ...state.messages,
    ];

    const response = await modelWithTools.invoke(messages);

    if (response?.tool_calls?.length) {
        // Check for routing first
        const routeCall = response.tool_calls.find(toolCall => toolCall.name === "route");
        if (routeCall) {
            return new Command({
                goto: routeCall.args.next
            });
        }

        const processingMessages = [];
        processingMessages.push(response);

        // Process other tool calls
        for (const toolCall of response.tool_calls) {
            if (toolCall.name === tavilyTool.name) {
                const result = await tavilyTool.invoke(toolCall);
                const toolMessage = new ToolMessage({
                    name: tavilyTool.name,
                    content: result.content,
                    tool_call_id: toolCall.id!
                });
                processingMessages.push(toolMessage);
            } else if (toolCall.name === packingTool.name) {
                const result = await packingTool.invoke(toolCall.args as PackingGuideSchema);
                const toolMessage = new ToolMessage({
                    name: packingTool.name,
                    content: result.content,
                    tool_call_id: toolCall.id!
                });
                processingMessages.push(toolMessage);
            }
        }

        const finalResult = await modelWithTools.invoke([...messages, ...processingMessages]);

        return new Command({
            update: {
                messages: [...processingMessages, finalResult]
            }
        });
    }

    return new Command({
        update: {
            messages: [new AIMessage({ content: response.content, name: "travelAdvisor" })]
        }
    });
};

const flightAgent = async (state: typeof AppState.State) => {
    const model = new AzureChatOpenAI({ model: "gpt-4o" });

    const possibleDestinations = [END, "hotelAdvisor", "travelAdvisor"] as const;

    const routingTool = {
        name: "route",
        description: `
            Select the next agent to call.
            If you need general travel help or sightseeing recommendations, go to 'travel_advisor' for help.
            If you need hotel recommendations, go to 'hotel_advisor' for help.
            If user finished their question, return '__end__'.
            ONLY use this tool if no other tool can provide the answer.
        `,
        schema: z.object({
            next: z.enum(possibleDestinations),
            reason: z.string().describe("Reason for selecting the next agent"),
        }),
    }

    const modelWithTools = model.bindTools([tavilyTool, routingTool]);

    const instruction = `
        You are a flight booking expert that can help users find and book flights.
        You can provide information about airlines, routes, prices, and booking procedures.
        You may use the Tavily search engine to search the web for flight information and deals.
        You may use the 'route' tool to select the next agent to call. ONLY use the tool 'route' if no other tool is applicable.

        Never mention other agents by name.
    `;

    const messages = [
        new SystemMessage({ content: instruction }),
        ...state.messages,
    ];

    const response = await modelWithTools.invoke(messages);

    if (response?.tool_calls?.length) {
        // Check for routing first
        const routeCall = response.tool_calls.find(toolCall => toolCall.name === "route");
        if (routeCall) {
            return new Command({
                goto: routeCall.args.next
            });
        }

        const processingMessages = [];
        processingMessages.push(response);

        // Process other tool calls
        for (const toolCall of response.tool_calls) {
            if (toolCall.name === tavilyTool.name) {
                const result = await tavilyTool.invoke(toolCall);
                const toolMessage = new ToolMessage({
                    name: tavilyTool.name,
                    content: result.content,
                    tool_call_id: toolCall.id!
                });
                processingMessages.push(toolMessage);
            }
        }

        const finalResult = await modelWithTools.invoke([...messages, ...processingMessages]);

        return new Command({
            update: {
                messages: [...processingMessages, finalResult]
            }
        });
    }

    return new Command({
        update: {
            messages: [new AIMessage({ content: response.content, name: "flightAgent" })]
        }
    });
};

const hotelAdvisor = async (state: typeof AppState.State) => {
    const model = new AzureChatOpenAI({ model: "gpt-4o" });

    const possibleDestinations = [END, "travelAdvisor", "flightAgent"] as const;

    const routingTool = {
        name: "route",
        description: `
            Select the next agent to call.
            If you need general travel help or sightseeing recommendations, go to 'travel_advisor' for help.
            If you need flight booking assistance, go to 'flight_agent' for help.
            If user finished their question, return '__end__'.
            ONLY use this tool if no other tool can provide the answer.
        `,
        schema: z.object({
            next: z.enum(possibleDestinations),
            reason: z.string().describe("Reason for selecting the next agent"),
        }),
    }

    const modelWithTools = model.bindTools([routingTool, tavilyTool]);

    const instruction = `
        You are a booking expert that provides hotel recommendations for a given destination.
        You may use the Tavily search engine to search the web for important information about hotels and accommodations.
        You may use the 'route' tool to select the next agent to call. ONLY use the tool 'route' if no other tool is applicable.

        Never mention other agents by name.
    `;

    const messages = [
        new SystemMessage({ content: instruction }),
        ...state.messages,
    ];

    const response = await modelWithTools.invoke(messages);

    if (response?.tool_calls?.length) {
        // Check for routing first
        const routeCall = response.tool_calls.find(toolCall => toolCall.name === "route");
        if (routeCall) {
            return new Command({
                goto: routeCall.args.next
            });
        }

        const processingMessages = [];
        processingMessages.push(response);

        // Process other tool calls
        for (const toolCall of response.tool_calls) {
            if (toolCall.name === tavilyTool.name) {
                const result = await tavilyTool.invoke(toolCall);
                const toolMessage = new ToolMessage({
                    name: tavilyTool.name,
                    content: result.content,
                    tool_call_id: toolCall.id!
                });
                processingMessages.push(toolMessage);
            }
        }

        const finalResult = await modelWithTools.invoke([...messages, ...processingMessages]);

        return new Command({
            update: {
                messages: [...processingMessages, finalResult]
            }
        });
    }

    return new Command({
        update: {
            messages: [new AIMessage({ content: response.content, name: "hotelAdvisor" })]
        }
    });
};

// ✅ Build the LangGraph state machine
const graph = new StateGraph(AppState)
    .addNode("travelAdvisor", travelAdvisor, {
        ends: ["flightAgent", "hotelAdvisor", END]
    })
    .addNode("flightAgent", flightAgent, {
        ends: ["hotelAdvisor", "travelAdvisor", END]
    })
    .addNode("hotelAdvisor", hotelAdvisor, {
        ends: ["flightAgent", "travelAdvisor", END]
    })
    .addEdge(START, "travelAdvisor")

// ✅ Chat processing function
export const processChat = async (messages: BaseMessage[], sessionId: string) => {
    const user_id = "u1233";
    const config = { configurable: { "thread_id": sessionId, user_id } };

    const app = graph.compile({
        checkpointer,
        store: inMemoryStore,
    });

    const result = await app.invoke({ messages }, config);

    return result;
};

