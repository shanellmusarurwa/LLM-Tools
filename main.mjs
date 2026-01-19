import OpenAI from "openai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const llmModelName = process.env.LLM_MODEL_NAME;

// Use OpenRouter if available, otherwise try Gemini
const useOpenRouter = !!openRouterApiKey;
const useGemini = !!geminiApiKey && !useOpenRouter;

if (!useOpenRouter && !useGemini) {
  console.error(
    "Either OPENROUTER_API_KEY or GEMINI_API_KEY must be set in .env file"
  );
  process.exit(1);
}

// ------------------
// Tool Logic
// ------------------
const getFlightSchedule = ({ origin, destination }) => ({
  origin,
  destination,
  flight_time_hours: 5.5,
  price_usd: 920,
});

const getHotelSchedule = ({ city }) => ({
  city,
  hotels: [
    { name: "Nairobi Serena", price_usd: 250 },
    { name: "Radisson Blu", price_usd: 200 },
  ],
});

const convertCurrency = ({ amount, from_currency, to_currency }) => {
  const rates = { USD_NGN: 925 };
  return {
    amount_converted: amount * rates[`${from_currency}_${to_currency}`],
    currency: to_currency,
  };
};

// ------------------
// Tool Definitions
// ------------------
const tools = [
  {
    type: "function",
    function: {
      name: "get_flight_schedule",
      description: "Returns flight duration and USD price",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
        },
        required: ["origin", "destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_hotel_schedule",
      description: "Get hotel options for a city",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_currency",
      description: "Convert currencies",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number" },
          from_currency: { type: "string" },
          to_currency: { type: "string" },
        },
        required: ["amount", "from_currency", "to_currency"],
      },
    },
  },
];

// ------------------
// Main Execution
// ------------------
async function main() {
  try {
    let client;
    let model;

    if (useOpenRouter) {
      client = new OpenAI({
        apiKey: openRouterApiKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Flight and Hotel Booking Assistant",
        },
      });
      model = llmModelName || "openai/gpt-3.5-turbo";
    } else if (useGemini) {
      console.error(
        "Gemini SDK requires different implementation. Please use OpenRouter instead."
      );
      process.exit(1);
    }

    const messages = [
      {
        role: "user",
        content:
          "I'm taking a flight from Lagos to Nairobi for a conference. I would like to know the total flight time back and forth, and the total cost of logistics for this conference if I'm staying for three days.",
      },
    ];

    let finalResponse = null;
    const maxIterations = 10;
    let iteration = 0;

    // Handle the conversation loop with tool calls
    while (iteration < maxIterations && !finalResponse) {
      const response = await client.chat.completions.create({
        model: model,
        messages: messages,
        tools: tools,
        tool_choice: "auto",
      });

      const message = response.choices[0].message;
      messages.push(message);

      // Check if there are tool calls to execute
      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          let result;

          // Execute the appropriate tool function
          if (functionName === "get_flight_schedule") {
            result = getFlightSchedule(functionArgs);
          } else if (functionName === "get_hotel_schedule") {
            result = getHotelSchedule(functionArgs);
          } else if (functionName === "convert_currency") {
            result = convertCurrency(functionArgs);
          }

          // Add the tool response to the conversation
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      } else {
        // If no tool calls, we have the final response
        finalResponse = message.content;
        break;
      }

      iteration++;
    }

    if (finalResponse) {
      console.log(finalResponse);
    } else {
      console.log("Could not get a final response after maximum iterations.");
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
