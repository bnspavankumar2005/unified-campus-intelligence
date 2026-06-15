# Unified Campus Intelligence Dashboard with AI Assistant (IIT Roorkee)

An elegant, real-time web portal that consolidates fragmented campus systems at **IIT Roorkee (IITR)** into a single dashboard. 

**🔗 Live Demo:** [https://unified-campus-intelligence-eight.vercel.app/](https://unified-campus-intelligence-eight.vercel.app/)

Instead of dumping scattered data (messes, calendars, libraries, weather) into a giant, centralized database using brittle web scrapers, this project utilizes **Model Context Protocol (MCP) Servers** for each distinct data source. An embedded AI Assistant dynamically queries these independent servers in real-time to answer natural-language student queries.

---

## 🏛️ Architecture Overview

The system consists of three main tiers:
1. **Dashboard UI (Next.js)**: A dark-themed student dashboard containing specialized widgets and an integrated AI Assistant sidebar. It features a size-bounded, scrollable **Real-Time MCP Inspector** that displays the raw JSON-RPC packages sent and received over SSE.
2. **AI Gateway (Next.js App Router API)**: The orchestration layer that acts as the MCP client, fetching tools, setting up schemas (handling strict uppercase formatting requirements), and executing the LLM tool-calling loop.
3. **MCP Server Hub (Express & Node.js)**: A single Node process hosting five independent SSE-based MCP servers (Library, Cafeteria, Events, Academics, Weather).

```mermaid
graph TD
    Client[Next.js Frontend / Dashboard] <--> |Fetch / HTTP| Gateway[Next.js Backend / API Gateway]
    Gateway <--> |Tool Calls & Prompts| LLM[Gemma 4 / LLM Provider via Google SDK or OpenAI API]
    Gateway <--> |MCP Protocol over SSE| CafeteriaMCP[Cafeteria MCP Server]
    Gateway <--> |MCP Protocol over SSE| LibraryMCP[Library MCP Server]
    Gateway <--> |MCP Protocol over SSE| EventsMCP[Events MCP Server]
    Gateway <--> |MCP Protocol over SSE| AcademicsMCP[Academics MCP Server]
    Gateway <--> |MCP Protocol over SSE| WeatherMCP[Weather MCP Server]
```

---

## ✨ Key Features

1. **5 Independent MCP Servers**:
   - **Library MCP**: Connects to the Mahatma Gandhi Central Library (MGCL) database properties, manages rules, and executes live searches.
   - **Cafeteria MCP**: Holds the weekly mess menu (from Monday's Poha/Jalebi to Sunday's Shahi Paneer/Custard), daily items, and local campus eateries (Desi Tadka, Ramesh Dosa, Olive & Rustic, etc.).
   - **Events MCP**: Hosts information on major annual fests (Thomso cultural, Cognizance technical, Sangram sports, Shrishti hobbies) and upcoming club workshops (SDSLabs, PAG, InfoSec, Choreography).
   - **Academics MCP**: Houses the official Autumn Semester 2026-27 calendar dates, relative grading policies, attendance requirements, and "Inane Campus Rules" (such as the lawn prohibition and the cabbage roll ritual).
   - **Weather MCP**: A dedicated, live weather server for Roorkee coordinates.
2. **Live APIs Integration**:
   - **Open Library API**: The Library MCP queries `openlibrary.org` live for search terms, enriches results with local MGCL catalog shelf mappings and availability markers, and returns them globally without requiring IITR intranet/WiFi access.
   - **Open-Meteo API**: The Weather MCP queries real-time conditions for Roorkee, providing live temperature, rain alerts, and campus advice (e.g. warnings about wet LBS Stadium tracks).
3. **Embedded AI Assistant (Friday)**: An intelligent agent that routes natural-language questions to the correct MCP servers in real-time. It can query multiple servers at once to answer complex questions (e.g., *"Is it raining in Roorkee today? Also, what's for dinner in the mess?"*).
4. **Real-Time MCP Inspector Console**: A developer console widget at the bottom of the page that lists all JSON-RPC transaction payloads in real-time. It is constrained to a `max-height` of `250px` with internal scrolling to preserve layout integrity.
5. **High-Performance Fluid UI**: 
   - Uses native viewport document scrolling without nested viewport lockouts.
   - Leverages `position: fixed` background blur animations to avoid CPU/GPU layout repaints on scroll.
   - Employs optimized transition effects on card states to eliminate frame drops.
   - Prevents redundant widget queries (such as re-fetching weather or events) when toggling cafeteria tabs.

---

## 🛠️ Tech Stack

* **Frontend & Gateway**: React.js, Next.js (App Router), Vanilla CSS (styled for glassmorphism, transitions, and responsive grid layouts).
* **MCP Backend Hub**: Node.js, Express, `@modelcontextprotocol/sdk`.
* **LLM Engine**: OpenAI-compatible and native Google Gen AI SDK integration supporting:
  - **Gemma 4** (`gemma-4-31b-it` via native Google Gen AI SDK client).
  - **Gemma 2** (via Groq or OpenRouter).
  - **Local Ollama** (offline development).

---

## 🚀 Setup & Launch

### Prerequisites
* Node.js (v18+)
* An API Key for your LLM of choice (e.g., a free key from **Google AI Studio** or **Groq**)

### Step 1: Install Dependencies
From the root of the project, run:
```bash
npm run install:all
```
This will install all root, backend, and frontend dependencies.

### Step 2: Configure Environment Variables
Navigate to the `frontend/` directory, create a `.env` file (or edit the template provided), and add your API Key:
```env
# OPTION 1: Google AI Studio (Gemma 4 - Native SDK)
# Leave LLM_BASE_URL commented out to trigger native Google Gen AI SDK client
LLM_API_KEY=YOUR_GEMINI_API_KEY
LLM_MODEL=gemma-4-31b-it

# OPTION 2: Groq API (Gemma 2)
# LLM_BASE_URL=https://api.groq.com/openai/v1
# LLM_API_KEY=gsk_YOUR_GROQ_KEY_HERE
# LLM_MODEL=gemma2-9b-it
```

### Step 3: Run the Complete Stack
From the root of the project, launch both servers concurrently:
```bash
npm run dev
```
* **Dashboard App**: Runs on [http://localhost:3000](http://localhost:3000)
* **MCP Server Hub**: Runs on [http://localhost:3001](http://localhost:3001)

---

## 🧪 Verification & Manual Testing

1. Open [http://localhost:3000](http://localhost:3000) in your browser.
2. Observe the dashboard widgets populated with live weather details and mess menus.
3. Test library search (e.g., type "Cormen" or "Algorithms" and press Search) to verify the hybrid live Open Library API fetching.
4. Try typing these questions in the AI Assistant on the right and watch the **MCP Protocol Inspector** capture the JSON-RPC traffic:
   * *"What's for lunch on Wednesday?"* (Queries Cafeteria server)
   * *"Is it raining in Roorkee today? Can we hold sports events?"* (Queries Weather server)
   * *"Can you search the library for a C++ book and tell me what the cutoff for CSE branch change was?"* (Queries Library and Academics servers in a single turn)
   * *"Tell me about the campus rules, specifically about the lawns."* (Queries Academics server)
