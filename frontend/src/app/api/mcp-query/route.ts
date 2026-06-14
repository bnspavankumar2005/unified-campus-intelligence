import { NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from "eventsource";

if (typeof globalThis.EventSource === "undefined") {
  (globalThis as any).EventSource = EventSource;
}

const MCP_HUB_URL = process.env.MCP_HUB_URL || "http://localhost:3001";

export async function POST(req: Request) {
  try {
    const { server, tool, arguments: args } = await req.json();
    if (!server || !tool) {
      return NextResponse.json({ error: "Missing server or tool parameters" }, { status: 400 });
    }

    const sseUrl = new URL(`${MCP_HUB_URL}/mcp/${server}`);
    const transport = new SSEClientTransport(sseUrl);
    const client = new Client(
      { name: "gateway-query-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    
    const result = await client.callTool({
      name: tool,
      arguments: args || {}
    });

    await client.close();
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`MCP Direct Query Error (${req.url}):`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
