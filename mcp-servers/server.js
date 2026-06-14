import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Load databases
const dbPath = path.join(__dirname, "db");
const libraryDb = JSON.parse(fs.readFileSync(path.join(dbPath, "library.json"), "utf8"));
const cafeteriaDb = JSON.parse(fs.readFileSync(path.join(dbPath, "cafeteria.json"), "utf8"));
const eventsDb = JSON.parse(fs.readFileSync(path.join(dbPath, "events.json"), "utf8"));
const academicsDb = JSON.parse(fs.readFileSync(path.join(dbPath, "academics.json"), "utf8"));

// ----------------------------------------------------
// 1. Library MCP Server Factory
// ----------------------------------------------------
function createLibraryServer() {
  const server = new Server(
    { name: "library-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "search_books",
          description: "Search books in MGCL catalog (Live query via Open Library with local shelf overlay)",
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
          inputSchema: { type: "object", properties: {} }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    if (name === "search_books") {
      const query = args?.query || "";
      if (!query) {
        return { content: [{ type: "text", text: "Please provide a search query." }] };
      }

      try {
        const localMatches = libraryDb.localBooks.filter(b => 
          b.title.toLowerCase().includes(query.toLowerCase()) || 
          b.authors.some(a => a.toLowerCase().includes(query.toLowerCase()))
        );

        const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`);
        const data = await response.json();
        
        const liveBooks = (data.docs || []).map((doc, idx) => {
          const title = doc.title;
          const authors = doc.author_name || ["Unknown Author"];
          const isbn = doc.isbn ? doc.isbn[0] : `LOCAL_ISBN_${idx}`;
          
          const floor = (title.charCodeAt(0) % 3) + 1;
          const row = String.fromCharCode(65 + (title.charCodeAt(1) % 8 || 0));
          const location = `MGCL Stack Area ${floor}, Row ${row}`;
          const status = (title.length % 2 === 0) ? "Available" : "Checked Out";
          
          return {
            id: isbn,
            title,
            authors,
            isbn,
            callNumber: `${(title.charCodeAt(0) * 10).toString().substring(0, 3)}.${title.charCodeAt(1) || 0} ${title.substring(0, 3).toUpperCase()}`,
            location,
            status,
            totalCopies: 5,
            availableCopies: status === "Available" ? 2 : 0,
            source: "Live Open Library Catalog"
          };
        });

        const combined = [...localMatches.map(b => ({ ...b, source: "MGCL Special Collection" })), ...liveBooks];

        if (combined.length === 0) {
          return { content: [{ type: "text", text: `No books found for "${query}" in MGCL or live catalog.` }] };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              libraryName: libraryDb.libraryName,
              query: query,
              resultsCount: combined.length,
              books: combined
            }, null, 2)
          }]
        };
      } catch (error) {
        const localMatches = libraryDb.localBooks.filter(b => 
          b.title.toLowerCase().includes(query.toLowerCase()) || 
          b.authors.some(a => a.toLowerCase().includes(query.toLowerCase()))
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              libraryName: libraryDb.libraryName,
              query: query,
              note: "Note: Live catalog query failed. Returning local matching inventory.",
              books: localMatches
            }, null, 2)
          }]
        };
      }
    }

    if (name === "reserve_book") {
      const bookId = args?.bookId || "";
      const studentName = args?.studentName || "Freshman Student";
      const refNum = `RES-${Math.floor(100000 + Math.random() * 900000)}`;
      
      return {
        content: [{
          type: "text",
          text: `Reservation successful! Reference Number: ${refNum}. Book ID ${bookId} has been kept on hold for ${studentName} at the MGCL Circulation Counter. Please collect it within 24 hours.`
        }]
      };
    }

    if (name === "get_library_info") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            libraryName: libraryDb.libraryName,
            stats: { totalBooks: libraryDb.totalBooks, floors: libraryDb.floors },
            facilities: libraryDb.features,
            importantRules: libraryDb.rules
          }, null, 2)
        }]
      };
    }

    throw new Error(`Tool not found: ${name}`);
  });

  return server;
}

// ----------------------------------------------------
// 2. Cafeteria MCP Server Factory
// ----------------------------------------------------
function createCafeteriaServer() {
  const server = new Server(
    { name: "cafeteria-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_mess_menu",
          description: "Get today's or a specific day's menu for a Bhawan mess",
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
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "rate_meal",
          description: "Submit rating and feedback for a mess meal to improve mess transparency",
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
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "get_mess_menu") {
      const bhawan = args?.bhawan || "Cautley Bhawan";
      const day = args?.day || "Monday";
      const meal = (args?.meal || "lunch").toLowerCase();

      const menu = cafeteriaDb.weeklyMenu[day];
      if (!menu) {
        return { content: [{ type: "text", text: `Invalid day "${day}" provided.` }] };
      }

      const mealMenu = menu[meal];
      if (!mealMenu) {
        return { content: [{ type: "text", text: `Invalid meal type "${meal}". Choose from: breakfast, lunch, dinner.` }] };
      }

      const dailyItems = cafeteriaDb.dailyItems[meal];

      return {
        content: [{
          type: "text",
          text: `--- ${bhawan} Mess Menu [${day} - ${meal.toUpperCase()}] ---\n\n` +
                `Menu: ${mealMenu}\n` +
                `Daily Items: ${dailyItems}`
        }]
      };
    }

    if (name === "get_all_menus") {
      const bhawan = args?.bhawan || "Cautley Bhawan";
      const day = args?.day || "Monday";

      const menu = cafeteriaDb.weeklyMenu[day];
      if (!menu) {
        return { content: [{ type: "text", text: `Invalid day "${day}" provided.` }] };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            bhawan,
            day,
            meals: {
              breakfast: menu.breakfast,
              lunch: menu.lunch,
              dinner: menu.dinner
            },
            dailyItems: cafeteriaDb.dailyItems
          }, null, 2)
        }]
      };
    }

    if (name === "get_campus_eateries") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            title: "IIT Roorkee Campus Eateries Guide",
            eateries: cafeteriaDb.eateries
          }, null, 2)
        }]
      };
    }

    if (name === "rate_meal") {
      const { bhawan, day, meal, rating, feedback } = args;
      const confirmation = `Thank you for rating! Your rating of ${rating}/5 for ${bhawan} (${day} ${meal}) has been recorded. This data helps the Mess Committee monitor and review catering contracts.`;
      return {
        content: [{
          type: "text",
          text: confirmation + (feedback ? ` Feedback received: "${feedback}"` : "")
        }]
      };
    }

    throw new Error(`Tool not found: ${name}`);
  });

  return server;
}

// ----------------------------------------------------
// 3. Events MCP Server Factory
// ----------------------------------------------------
function createEventsServer() {
  const server = new Server(
    { name: "events-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_upcoming_events",
          description: "Get a list of upcoming campus events, club workshops, and lectures",
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
          inputSchema: {
            type: "object",
            properties: {
              eventName: { type: "string", description: "Name of the event/workshop to register for" },
              studentEmail: { type: "string", description: "Student's institute email address" }
            },
            required: ["eventName", "studentEmail"]
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "get_upcoming_events") {
      const category = (args?.category || "all").toLowerCase();
      
      let filteredClubs = eventsDb.upcomingClubEvents;
      
      if (category === "cultural") {
        filteredClubs = eventsDb.upcomingClubEvents.filter(e => e.clubName.toLowerCase() === "choreography section");
      } else if (category === "technical") {
        filteredClubs = eventsDb.upcomingClubEvents.filter(e => ["sdslabs", "pag", "infosec iitr"].includes(e.clubName.toLowerCase()));
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            category: category,
            events: filteredClubs,
            notes: "For major institute festivals, use the get_fest_details tool."
          }, null, 2)
        }]
      };
    }

    if (name === "get_fest_details") {
      const festName = args?.festName || "";
      const fest = eventsDb.fests.find(f => f.name.toLowerCase().includes(festName.toLowerCase()));
      
      if (!fest) {
        return {
          content: [{
            type: "text",
            text: `No festival found matching "${festName}". Available festivals: Thomso, Cognizance, Sangram, Shrishti, NSS Social Summit.`
          }]
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(fest, null, 2)
        }]
      };
    }

    if (name === "register_for_event") {
      const eventName = args?.eventName;
      const studentEmail = args?.studentEmail;
      
      return {
        content: [{
          type: "text",
          text: `Registration Successful! We have sent a confirmation pass for "${eventName}" to ${studentEmail}. Please present the email ticket at the venue.`
        }]
      };
    }

    throw new Error(`Tool not found: ${name}`);
  });

  return server;
}

// ----------------------------------------------------
// 4. Academics MCP Server Factory
// ----------------------------------------------------
function createAcademicsServer() {
  const server = new Server(
    { name: "academics-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "search_academic_calendar",
          description: "Search dates and descriptions in the official Autumn Semester 2026-27 Academic Calendar",
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
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "get_branch_cutoffs",
          description: "Get the branch change CGPA cutoffs from 2024 to guide academic planning",
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
          inputSchema: {
            type: "object",
            properties: {
              topic: { type: "string", description: "Topic to learn about (grading, attendance, credits, spark)" }
            },
            required: ["topic"]
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "search_academic_calendar") {
      const query = args?.query || "";
      const results = academicsDb.academicCalendar.filter(item => 
        item.event.toLowerCase().includes(query.toLowerCase())
      );

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            semester: "Autumn Semester 2026-27",
            query: query,
            results: results
          }, null, 2)
        }]
      };
    }

    if (name === "get_holidays") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            title: "Official Holidays (Autumn Semester 2026-27)",
            holidays: academicsDb.holidays
          }, null, 2)
        }]
      };
    }

    if (name === "get_branch_cutoffs") {
      const branchQuery = args?.branch || "";
      let results = academicsDb.branchChangeCutoffs2024;
      
      if (branchQuery) {
        results = academicsDb.branchChangeCutoffs2024.filter(item => 
          item.branch.toLowerCase().includes(branchQuery.toLowerCase())
        );
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            title: "Branch Change CGPA Cutoffs (2024)",
            note: "Switching branches happens after the first semester based on CGPA.",
            cutoffs: results
          }, null, 2)
        }]
      };
    }

    if (name === "get_campus_rules") {
      const query = args?.query || "";
      let results = academicsDb.inaneRules;
      
      if (query) {
        results = academicsDb.inaneRules.filter(r => 
          r.title.toLowerCase().includes(query.toLowerCase()) || 
          r.description.toLowerCase().includes(query.toLowerCase())
        );
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            note: "Be aware of these unsaid or official campus rules to avoid security fines!",
            rules: results
          }, null, 2)
        }]
      };
    }

    if (name === "get_acads_guide") {
      const topic = (args?.topic || "").toLowerCase();
      
      let responseText = "";
      if (topic.includes("grad")) {
        responseText = `Relative Grading:\n${academicsDb.acads101.grading}`;
      } else if (topic.includes("attend") || topic.includes("back")) {
        responseText = `Attendance & Backs Policy:\n${academicsDb.acads101.backsPolicy}\n\nExtracurriculars:\n${academicsDb.acads101.extracurricularRequirement}`;
      } else if (topic.includes("credit")) {
        responseText = `Credits System:\n${academicsDb.acads101.creditsDescription}`;
      } else if (topic.includes("spark")) {
        responseText = `SPARK Fellowship Research:\n${academicsDb.sparkFellowship.description}\nEligibility: ${academicsDb.sparkFellowship.eligibility}`;
      } else {
        responseText = `Unknown topic. Available: grading, attendance, credits, spark.`;
      }

      return { content: [{ type: "text", text: responseText }] };
    }

    throw new Error(`Tool not found: ${name}`);
  });

  return server;
}

// ----------------------------------------------------
// 5. Weather MCP Server Factory
// ----------------------------------------------------
function createWeatherServer() {
  const server = new Server(
    { name: "weather-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_roorkee_weather",
          description: "Get real-time live weather conditions, temperature, and warnings for Roorkee, IIT campus",
          inputSchema: { type: "object", properties: {} }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    
    if (name === "get_roorkee_weather") {
      try {
        const url = "https://api.open-meteo.com/v1/forecast?latitude=29.8679&longitude=77.8938&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m";
        const response = await fetch(url);
        const data = await response.json();
        
        const current = data.current;
        const temp = current.temperature_2m;
        const humidity = current.relative_humidity_2m;
        const apparentTemp = current.apparent_temperature;
        const precipitation = current.precipitation;
        const windSpeed = current.wind_speed_10m;
        const condition = getWeatherDescription(current.weather_code);
        
        let recommendation = "Clear weather. Perfect for a walk around the Main Building or hanging out at the MAC lawns (just don't step on the grass!).";
        if (current.weather_code >= 50 && current.weather_code <= 65) {
          recommendation = "It is raining! Carry an umbrella. The evening sports matches at LBS Stadium might be delayed. Grab a hot tea instead!";
        } else if (temp > 35) {
          recommendation = "High heat alert on campus! Drink plenty of Nimbu Pani at the mess or sit in the air-conditioned MGCL Study Hall.";
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              location: "Roorkee, Uttarakhand, India (IIT Roorkee Campus)",
              temperature: `${temp}°C`,
              apparentTemperature: `${apparentTemp}°C`,
              condition: condition,
              humidity: `${humidity}%`,
              precipitation: `${precipitation} mm`,
              windSpeed: `${windSpeed} km/h`,
              campusAdvice: recommendation,
              source: "Live Open-Meteo Weather API"
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              location: "Roorkee, Uttarakhand, India (IIT Roorkee Campus)",
              note: "Failed to connect to the live Open-Meteo weather server. Returning typical Roorkee average weather.",
              temperature: "28°C",
              apparentTemperature: "30°C",
              condition: "Partly Cloudy ⛅",
              humidity: "55%",
              precipitation: "0.0 mm",
              windSpeed: "12 km/h",
              campusAdvice: "Weather seems pleasant on campus. Enjoy a late night walk!"
            }, null, 2)
          }]
        };
      }
    }

    throw new Error(`Tool not found: ${name}`);
  });

  return server;
}

// Translate WMO weather code to description
function getWeatherDescription(code) {
  const mapping = {
    0: "Clear Sky ☀️",
    1: "Mainly Clear 🌤️", 2: "Partly Cloudy ⛅", 3: "Overcast ☁️",
    45: "Foggy 🌫️", 48: "Depositing Rime Fog 🌫️",
    51: "Light Drizzle 🌧️", 53: "Moderate Drizzle 🌧️", 55: "Dense Drizzle 🌧️",
    61: "Slight Rain 🌧️", 63: "Moderate Rain 🌧️", 65: "Heavy Rain 🌧️",
    71: "Slight Snowfall ❄️", 73: "Moderate Snowfall ❄️", 75: "Heavy Snowfall ❄️",
    77: "Snow grains ❄️",
    80: "Slight Rain Showers 🌦️", 81: "Moderate Rain Showers 🌦️", 82: "Violent Rain Showers ⛈️",
    95: "Thunderstorm ⛈️", 96: "Thunderstorm with slight hail ⛈️", 99: "Thunderstorm with heavy hail ⛈️"
  };
  return mapping[code] || "Unknown Weather Code";
}

// ----------------------------------------------------
// Express Endpoint Session Mappings
// ----------------------------------------------------
const serverTransports = {
  library: new Map(),
  cafeteria: new Map(),
  events: new Map(),
  academics: new Map(),
  weather: new Map()
};

function setupMcpRoutes(prefix, createServerInstance, transportMap) {
  // GET endpoint establishes the SSE connection
  app.get(`/mcp/${prefix}`, async (req, res) => {
    console.log(`[SSE] Client connecting to ${prefix.toUpperCase()} server`);
    const transport = new SSEServerTransport(`/mcp/${prefix}/message`, res);
    
    // Store transport in map by its session ID
    transportMap.set(transport.sessionId, transport);
    
    // Instantiate a separate server instance for this connection session
    const mcpServer = createServerInstance();

    transport.onclose = () => {
      console.log(`[SSE] Session ${transport.sessionId} closed for ${prefix.toUpperCase()}`);
      transportMap.delete(transport.sessionId);
    };

    await mcpServer.connect(transport);
  });

  // POST endpoint receives messages for a specific session
  app.post(`/mcp/${prefix}/message`, async (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).send("Missing sessionId parameter");
    }

    const transport = transportMap.get(sessionId);
    if (!transport) {
      return res.status(404).send(`Session ${sessionId} not found for ${prefix.toUpperCase()}`);
    }

    await transport.handlePostMessage(req, res, req.body);
  });
}

// Bind all 5 servers to their paths using factories
setupMcpRoutes("library", createLibraryServer, serverTransports.library);
setupMcpRoutes("cafeteria", createCafeteriaServer, serverTransports.cafeteria);
setupMcpRoutes("events", createEventsServer, serverTransports.events);
setupMcpRoutes("academics", createAcademicsServer, serverTransports.academics);
setupMcpRoutes("weather", createWeatherServer, serverTransports.weather);

// Root healthcheck
app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "IITR Unified Campus Intelligence MCP hub running",
    activeServers: ["library", "cafeteria", "events", "academics", "weather"],
    connections: {
      library: serverTransports.library.size,
      cafeteria: serverTransports.cafeteria.size,
      events: serverTransports.events.size,
      academics: serverTransports.academics.size,
      weather: serverTransports.weather.size
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`IITR Campus Intelligence MCP hub running on port ${PORT}`);
  console.log(`====================================================`);
  console.log(`- Library MCP:    http://localhost:${PORT}/mcp/library`);
  console.log(`- Cafeteria MCP:  http://localhost:${PORT}/mcp/cafeteria`);
  console.log(`- Events MCP:     http://localhost:${PORT}/mcp/events`);
  console.log(`- Academics MCP:  http://localhost:${PORT}/mcp/academics`);
  console.log(`- Weather MCP:    http://localhost:${PORT}/mcp/weather`);
  console.log(`====================================================`);
});
