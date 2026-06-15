import { NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { GoogleGenAI } from "@google/genai";
import { EventSource } from "eventsource";

if (typeof globalThis.EventSource === "undefined") {
  (globalThis as any).EventSource = EventSource;
}

const LLM_BASE_URL = process.env.LLM_BASE_URL || "";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "gemini-2.5-flash";
const MCP_HUB_URL = process.env.MCP_HUB_URL || "http://localhost:3001";

// Static Tools definitions to avoid query handshakes on every chat turn
const STATIC_TOOLS = [
  // 1. Library Server Tools
  {
    name: "search_books",
    description: "Search books in MGCL catalog (Live query via Open Library with local shelf overlay)",
    server: "library",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Book title, author, or subject to search" }
      },
      required: ["query"]
    }
  },
  {
    name: "reserve_book",
    description: "Request a book reservation at the Mahatma Gandhi Central Library",
    server: "library",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "string", description: "ISBN or local ID of the book" },
        studentName: { type: "string", description: "Name of the student reserving the book" }
      },
      required: ["bookId", "studentName"]
    }
  },
  {
    name: "get_library_info",
    description: "Get general info, facilities, and rules of the MGCL library",
    server: "library",
    inputSchema: { type: "object", properties: {} }
  },

  // 2. Cafeteria Server Tools
  {
    name: "get_mess_menu",
    description: "Get today's or a specific day's menu for a Bhawan mess",
    server: "cafeteria",
    inputSchema: {
      type: "object",
      properties: {
        bhawan: { type: "string", description: "Name of the Bhawan (e.g. Cautley Bhawan, Rajendra Bhawan)" },
        day: { type: "string", description: "Day of the week (e.g. Monday, Tuesday)" },
        meal: { type: "string", description: "Meal type: breakfast, lunch, or dinner" }
      },
      required: ["bhawan"]
    }
  },
  {
    name: "get_all_menus",
    description: "Get all meals (breakfast, lunch, dinner) for a specific Bhawan and day",
    server: "cafeteria",
    inputSchema: {
      type: "object",
      properties: {
        bhawan: { type: "string", description: "Bhawan name" },
        day: { type: "string", description: "Day of the week" }
      },
      required: ["bhawan", "day"]
    }
  },
  {
    name: "get_campus_eateries",
    description: "Get a list of popular off-mess eateries and fast-food spots on or near campus",
    server: "cafeteria",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "rate_meal",
    description: "Submit rating and feedback for a mess meal to improve mess transparency",
    server: "cafeteria",
    inputSchema: {
      type: "object",
      properties: {
        bhawan: { type: "string", description: "Bhawan name" },
        day: { type: "string", description: "Day rated" },
        meal: { type: "string", description: "Meal rated" },
        rating: { type: "number", description: "Rating score from 1 to 5" },
        feedback: { type: "string", description: "Optional review feedback text" }
      },
      required: ["bhawan", "day", "meal", "rating"]
    }
  },

  // 3. Events Server Tools
  {
    name: "get_upcoming_events",
    description: "Get a list of upcoming campus events, club workshops, and lectures",
    server: "events",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by category (e.g. cultural, technical, sports, club)" }
      }
    }
  },
  {
    name: "get_fest_details",
    description: "Get detailed information about major annual festivals of IITR (Thomso, Cognizance, Sangram, Shrishti, NSS Social Summit)",
    server: "events",
    inputSchema: {
      type: "object",
      properties: {
        festName: { type: "string", description: "Name of the festival (e.g. Thomso, Cognizance, Sangram)" }
      },
      required: ["festName"]
    }
  },
  {
    name: "register_for_event",
    description: "Register a student for an upcoming club event or fest sub-event",
    server: "events",
    inputSchema: {
      type: "object",
      properties: {
        eventName: { type: "string", description: "Name of the event/workshop to register for" },
        studentEmail: { type: "string", description: "Student's institute email address" }
      },
      required: ["eventName", "studentEmail"]
    }
  },

  // 4. Academics Server Tools
  {
    name: "search_academic_calendar",
    description: "Search dates and descriptions in the official Autumn Semester 2026-27 Academic Calendar",
    server: "academics",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Term to search (e.g. registration, exams, mid-term, end-term, classes)" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_holidays",
    description: "Get the full list of official institute holidays for the semester",
    server: "academics",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_branch_cutoffs",
    description: "Get the branch change CGPA cutoffs from 2024 to guide academic planning",
    server: "academics",
    inputSchema: {
      type: "object",
      properties: {
        branch: { type: "string", description: "Filter by specific branch name (e.g. CSE, DSAI, Mechanical)" }
      }
    }
  },
  {
    name: "get_campus_rules",
    description: "Look up inane or official campus rules (e.g. lawns rule, library sleep, NSO attendance)",
    server: "academics",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for rules" }
      }
    }
  },
  {
    name: "get_acads_guide",
    description: "Get helpful guide information regarding relative grading,backs/attendance,credits,or the SPARK fellowship",
    server: "academics",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic to learn about (grading, attendance, credits, spark)" }
      },
      required: ["topic"]
    }
  },

  // 5. Weather Server Tools
  {
    name: "get_roorkee_weather",
    description: "Get real-time live weather conditions, temperature, and warnings for Roorkee, IIT campus",
    server: "weather",
    inputSchema: { type: "object", properties: {} }
  }
];

export async function POST(req: Request) {
  const mcpLogs: any[] = [];

  // Helper to log MCP events
  const logMcp = (direction: "client-to-server" | "server-to-client", server: string, method: string, payload: any) => {
    mcpLogs.push({
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
      direction,
      server,
      method,
      payload
    });
  };

  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Missing or invalid messages parameter" }, { status: 400 });
    }

    // Map tool names to their respective servers
    const toolToInterfaceMap: Record<string, string> = {};
    for (const tool of STATIC_TOOLS) {
      toolToInterfaceMap[tool.name] = tool.server;
    }

    const systemInstruction = `You are Friday, the Unified Campus Intelligence Assistant for IIT Roorkee (IITR) students. 
You have access to 5 independent campus MCP databases: Library (MGCL), Cafeteria (Mess & Eateries), Events (Fests & Workshops), Academics (Calendar, Cutoffs, relative grading, and inane rules), and Weather (Roorkee current forecast).
Answer student queries using these tools. Always explain relative grading, NSO attendance strictness, or campus rules if relevant to the conversation.
If a student asks about weather or cafeteria menus, use the tools. You must query the weather or menu dynamically.
Keep your answers helpful, friendly, and structured. Refer to landmarks on campus like LHC, MAC, LBS Stadium, and MGCL.`;

    let finalAnswer = "";

    // Check if we should use the Google Gen AI SDK
    const isGoogleSdk = !LLM_BASE_URL || LLM_BASE_URL.includes("googleapis.com");

    if (isGoogleSdk) {
      // ----------------------------------------------------
      // METHOD A: Google Gen AI SDK (Gemini & Google Gemma)
      // ----------------------------------------------------
      const ai = new GoogleGenAI({ apiKey: LLM_API_KEY });

      // Format tools for Google Gen AI
      const functionDeclarations = STATIC_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as any
      }));

      // Map chat messages to Google Gen AI history format
      const activeContents: any[] = messages.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

      let loopCount = 0;
      while (loopCount < 5) {
        let response: any;
        let sdkRetries = 3;
        let sdkDelay = 1000;

        for (let i = 0; i < sdkRetries; i++) {
          try {
            response = await ai.models.generateContent({
              model: LLM_MODEL,
              contents: activeContents,
              config: {
                systemInstruction,
                tools: [{ functionDeclarations }]
              }
            });
            break;
          } catch (err: any) {
            const isRateLimit = err.message?.includes("429") || err.status === 429 || JSON.stringify(err).includes("429");
            if (isRateLimit && i < sdkRetries - 1) {
              await new Promise((resolve) => setTimeout(resolve, sdkDelay));
              sdkDelay *= 2;
              continue;
            }
            throw err;
          }
        }

        const functionCalls = response.functionCalls;

        if (functionCalls && functionCalls.length > 0) {
          activeContents.push({
            role: "model",
            parts: functionCalls.map((call: any) => ({ functionCall: call }))
          });

          const toolResponses = [];
          for (const call of functionCalls) {
            const toolName = call.name || "";
            const toolArgs = call.args || {};
            const serverName = toolName ? toolToInterfaceMap[toolName] : undefined;

            if (!serverName) {
              toolResponses.push({
                functionResponse: {
                  name: toolName,
                  response: { result: `Error: Tool "${toolName}" has no registered server.` }
                }
              });
              continue;
            }

            // Establish connection ON-DEMAND to the single required server
            logMcp("client-to-server", serverName, "initialize (SSE Connect - On-Demand)", {});
            
            let client: Client | null = null;
            let toolOutputText = "";

            try {
              const sseUrl = new URL(`${MCP_HUB_URL}/mcp/${serverName}`);
              const transport = new SSEClientTransport(sseUrl);
              client = new Client({ name: "gateway-client", version: "1.0.0" }, { capabilities: {} });
              await client.connect(transport);
              logMcp("server-to-client", serverName, "initialize (Connected)", { status: "ready" });

              logMcp("client-to-server", serverName, "tools/call", { name: toolName, arguments: toolArgs });
              const executionResult = (await client.callTool({
                name: toolName,
                arguments: toolArgs as any
              })) as any;

              toolOutputText = (executionResult.content || [])
                .map((c: any) => c.text || "")
                .join("\n");

              logMcp("server-to-client", serverName, "tools/call (response)", executionResult);
            } catch (err: any) {
              toolOutputText = `Error executing tool: ${err.message}`;
              logMcp("server-to-client", serverName, "tools/call (error)", { error: err.message });
            } finally {
              if (client) {
                try {
                  await client.close();
                  logMcp("client-to-server", serverName, "connection-close", {});
                } catch (e) {}
              }
            }

            toolResponses.push({
              functionResponse: {
                name: toolName,
                response: { result: toolOutputText }
              }
            });
          }

          activeContents.push({
            role: "user",
            parts: toolResponses
          });

          loopCount++;
        } else {
          finalAnswer = response.text || "";
          break;
        }
      }
    } else {
      // ----------------------------------------------------
      // METHOD B: OpenAI-Compatible REST Client (Groq, Ollama)
      // ----------------------------------------------------
      const formattedTools = STATIC_TOOLS.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema
        }
      }));

      const activeMessages = [
        { role: "system", content: systemInstruction },
        ...messages
      ];

      let loopCount = 0;
      while (loopCount < 5) {
        const requestPayload = {
          model: LLM_MODEL,
          messages: activeMessages,
          tools: formattedTools,
          tool_choice: "auto",
          temperature: 0
        };

        let response: any;
        let restRetries = 3;
        let restDelay = 1000;

        for (let i = 0; i < restRetries; i++) {
          response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${LLM_API_KEY}`
            },
            body: JSON.stringify(requestPayload)
          });

          if (response.status === 429 && i < restRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, restDelay));
            restDelay *= 2;
            continue;
          }
          break;
        }

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 429) {
            return NextResponse.json({
              content: "⚠️ **Rate Limit Exceeded (429)**\n\nThe AI provider has reached its rate limits. Please try again in a moment.",
              logs: mcpLogs
            });
          }
          throw new Error(`LLM API Error (${response.status}): ${errText}`);
        }

        const llmResult = await response.json();
        const choice = llmResult.choices[0];
        const assistantMessage = choice.message;

        activeMessages.push(assistantMessage);

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
            const serverName = toolToInterfaceMap[toolName];

            if (!serverName) {
              activeMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: toolName,
                content: `Error: Tool "${toolName}" has no registered server.`
              });
              continue;
            }

            // Establish connection ON-DEMAND to the single required server
            logMcp("client-to-server", serverName, "initialize (SSE Connect - On-Demand)", {});
            
            let client: Client | null = null;
            let toolOutputText = "";

            try {
              const sseUrl = new URL(`${MCP_HUB_URL}/mcp/${serverName}`);
              const transport = new SSEClientTransport(sseUrl);
              client = new Client({ name: "gateway-client", version: "1.0.0" }, { capabilities: {} });
              await client.connect(transport);
              logMcp("server-to-client", serverName, "initialize (Connected)", { status: "ready" });

              logMcp("client-to-server", serverName, "tools/call", { name: toolName, arguments: toolArgs });
              const executionResult = (await client.callTool({
                name: toolName,
                arguments: toolArgs
              })) as any;

              toolOutputText = (executionResult.content || [])
                .map((c: any) => c.text || "")
                .join("\n");

              logMcp("server-to-client", serverName, "tools/call (response)", executionResult);
            } catch (err: any) {
              toolOutputText = `Error executing tool: ${err.message}`;
              logMcp("server-to-client", serverName, "tools/call (error)", { error: err.message });
            } finally {
              if (client) {
                try {
                  await client.close();
                  logMcp("client-to-server", serverName, "connection-close", {});
                } catch (e) {}
              }
            }

            activeMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolName,
              content: toolOutputText
            });
          }
          loopCount++;
        } else {
          finalAnswer = assistantMessage.content || "";
          break;
        }
      }
    }

    return NextResponse.json({
      content: finalAnswer || "I was unable to compile an answer. Please try again.",
      logs: mcpLogs
    });

  } catch (error: any) {
    console.error("AI Gateway Route Error:", error);
    return NextResponse.json(
      { error: `Internal server error: ${error.message}` },
      { status: 500 }
    );
  }
}
