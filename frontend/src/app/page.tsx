"use client";

import { useState, useEffect, useRef } from "react";

interface LogEntry {
  id: string;
  timestamp: string;
  direction: "client-to-server" | "server-to-client";
  server: string;
  method: string;
  payload: any;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Dashboard() {
  // Personalization State
  const [bhawan, setBhawan] = useState("Cautley Bhawan");
  const [selectedDay, setSelectedDay] = useState("");

  // Widget States
  const [weatherData, setWeatherData] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [messMenu, setMessMenu] = useState<string>("");
  const [messLoading, setMessLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<"breakfast" | "lunch" | "dinner">("lunch");
  const [libQuery, setLibQuery] = useState("");
  const [libResults, setLibResults] = useState<any>(null);
  const [libLoading, setLibLoading] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [acadQuery, setAcadQuery] = useState("");
  const [acadResults, setAcadResults] = useState<any[]>([]);
  const [acadLoading, setAcadLoading] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I am Friday, your IITR Campus Intelligence Assistant. Ask me anything about the Mahatma Gandhi Central Library (MGCL), Cautley/Rajendra mess menus, fests (Thomso, Cognizance), or academic calendar cutoffs and rules!"
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // MCP Inspector State
  const [mcpLogs, setMcpLogs] = useState<LogEntry[]>([]);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(true);

  // Refs for auto-scrolling
  const chatEndRef = useRef<HTMLDivElement>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Get current day of the week on load
  useEffect(() => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const today = days[new Date().getDay()];
    // On load, set the meal tab based on time of day
    const hours = new Date().getHours();
    let initialMeal: "breakfast" | "lunch" | "dinner" = "lunch";
    if (hours < 10) initialMeal = "breakfast";
    else if (hours > 17) initialMeal = "dinner";
    setSelectedMeal(initialMeal);
    setSelectedDay(today);
  }, []);

  // Fetch initial dashboard widget data once day is set
  useEffect(() => {
    if (selectedDay) {
      fetchWeather();
      fetchEvents();
      searchAcademics("exam"); // default load exam schedules
    }
  }, [selectedDay]);

  // Fetch cafeteria mess menu data only when bhawan, selectedDay, or selectedMeal changes
  useEffect(() => {
    if (selectedDay) {
      fetchMessMenu();
    }
  }, [bhawan, selectedDay, selectedMeal]);

  // Scroll utilities
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isInspectorCollapsed) {
      consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [mcpLogs, isInspectorCollapsed]);

  // Widget dynamic loaders
  const fetchWeather = async () => {
    setWeatherLoading(true);
    try {
      const res = await fetch("/api/mcp-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: "weather", tool: "get_roorkee_weather" })
      });
      const data = await res.json();
      if (data.content && data.content[0]) {
        setWeatherData(JSON.parse(data.content[0].text));
      }
    } catch (err) {
      console.error("Error fetching weather widget:", err);
    } finally {
      setWeatherLoading(false);
    }
  };

  const fetchMessMenu = async (mealToFetch?: "breakfast" | "lunch" | "dinner") => {
    setMessLoading(true);
    try {
      const meal = mealToFetch || selectedMeal;
      const res = await fetch("/api/mcp-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server: "cafeteria",
          tool: "get_mess_menu",
          arguments: { bhawan, day: selectedDay, meal }
        })
      });
      const data = await res.json();
      if (data.content && data.content[0]) {
        setMessMenu(data.content[0].text);
      }
    } catch (err) {
      console.error("Error fetching mess menu widget:", err);
    } finally {
      setMessLoading(false);
    }
  };

  const fetchEvents = async () => {
    setEventsLoading(true);
    try {
      const res = await fetch("/api/mcp-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: "events", tool: "get_upcoming_events", arguments: { category: "all" } })
      });
      const data = await res.json();
      if (data.content && data.content[0]) {
        const parsed = JSON.parse(data.content[0].text);
        setUpcomingEvents(parsed.events || []);
      }
    } catch (err) {
      console.error("Error fetching events widget:", err);
    } finally {
      setEventsLoading(false);
    }
  };

  const searchLibrary = async () => {
    if (!libQuery.trim()) return;
    setLibLoading(true);
    try {
      const res = await fetch("/api/mcp-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: "library", tool: "search_books", arguments: { query: libQuery } })
      });
      const data = await res.json();
      if (data.content && data.content[0]) {
        const parsed = JSON.parse(data.content[0].text);
        setLibResults(parsed);
      }
    } catch (err) {
      console.error("Error searching library widget:", err);
    } finally {
      setLibLoading(false);
    }
  };

  const searchAcademics = async (searchVal?: string) => {
    const val = searchVal !== undefined ? searchVal : acadQuery;
    if (!val.trim()) return;
    setAcadLoading(true);
    try {
      const res = await fetch("/api/mcp-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: "academics", tool: "search_academic_calendar", arguments: { query: val } })
      });
      const data = await res.json();
      if (data.content && data.content[0]) {
        const parsed = JSON.parse(data.content[0].text);
        setAcadResults(parsed.results || []);
      }
    } catch (err) {
      console.error("Error searching academics widget:", err);
    } finally {
      setAcadLoading(false);
    }
  };

  // AI Assistant Chat Handler
  const sendChatMessage = async (textToSend?: string) => {
    const text = textToSend || chatInput;
    if (!text.trim() || chatLoading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages })
      });
      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error from Assistant Gateway: ${data.error}` }
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
        if (data.logs && Array.isArray(data.logs)) {
          setMcpLogs((prev) => [...prev, ...data.logs]);
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Failed to reach gateway server: ${err.message}` }
      ]);
    } finally {
      setChatLoading(false);
      // Refresh current widgets since AI action might have changed ratings or registrations
      fetchMessMenu();
      fetchEvents();
    }
  };

  const getActiveMealLabel = () => {
    const hours = new Date().getHours();
    if (hours < 10) return "BREAKFAST";
    if (hours > 17) return "DINNER";
    return "LUNCH";
  };

  return (
    <div className="dashboard-container">
      {/* LEFT COLUMN: Unified Widgets Grid */}
      <main className="main-content">
        <header className="dashboard-header">
          <div className="header-title">
            <h1>IITR Campus Intelligence</h1>
            <div className="live-indicator">
              <span className="dot"></span>
              <span>MCP Server Hub Live</span>
            </div>
          </div>
          <div className="header-meta">
            <div className="bhawan-selector">
              <select value={bhawan} onChange={(e) => setBhawan(e.target.value)}>
                {["Cautley Bhawan", "Rajendra Bhawan", "Radhakrishnan Bhawan", "Sarojini Bhawan", "Kasturba Bhawan", "Ravindra Bhawan"].map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="bhawan-selector">
              <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <div className="widgets-grid">
          {/* 1. Live Weather Widget */}
          <section className="glass-card">
            <div className="widget-title">
              <span>Roorkee Weather</span>
              <button className="btn-accent" onClick={fetchWeather} disabled={weatherLoading}>
                {weatherLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            {weatherData ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: "2rem", fontWeight: 800, color: "#fff" }}>
                    {weatherData.temperature}
                  </div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                    {weatherData.condition}
                  </div>
                </div>
                <div className="weather-details">
                  <div className="weather-metric">
                    <div className="weather-value">{weatherData.apparentTemperature}</div>
                    <div className="weather-label">Feels Like</div>
                  </div>
                  <div className="weather-metric">
                    <div className="weather-value">{weatherData.humidity}</div>
                    <div className="weather-label">Humidity</div>
                  </div>
                </div>
                <div style={{ marginTop: "12px", fontSize: "0.78rem", color: "var(--text-muted)", borderTop: "1px solid rgba(75,85,99,0.2)", paddingTop: "8px" }}>
                  <strong>Friday's Advice:</strong> {weatherData.campusAdvice}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Connecting to weather server...
              </div>
            )}
          </section>

          {/* 2. Cafeteria Widget */}
          <section className="glass-card">
            <div className="widget-title">
              <span>Mess Menu Preview</span>
              <span className="badge badge-warning">{selectedMeal.toUpperCase()}</span>
            </div>
            {/* Meal Selector Tabs */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
              {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
                <button
                  key={meal}
                  className="chip"
                  style={{
                    background: selectedMeal === meal ? "var(--color-primary)" : "rgba(75, 85, 99, 0.15)",
                    borderColor: selectedMeal === meal ? "var(--color-accent)" : "var(--border-subtle)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    flex: 1,
                    textAlign: "center",
                    fontWeight: selectedMeal === meal ? "700" : "500",
                    padding: "6px 0",
                    borderRadius: "6px"
                  }}
                  onClick={() => setSelectedMeal(meal)}
                >
                  {meal.toUpperCase()}
                </button>
              ))}
            </div>
            {messLoading ? (
              <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", padding: "20px 0" }}>
                Querying cafeteria database...
              </div>
            ) : (
              <div className="menu-meal-row" style={{ marginTop: "0" }}>
                <div className="meal-box active-meal">
                  <div className="meal-label">{selectedMeal.toUpperCase()} ({selectedDay})</div>
                  <div className="meal-content">
                    {(() => {
                      const parts = messMenu ? messMenu.split("Daily Items:") : [];
                      const mainItems = parts[0] ? parts[0].replace(/---.*---/g, "").replace(/Menu: /g, "").trim() : "";
                      const dailyItems = parts[1] ? parts[1].trim() : "";
                      return (
                        <>
                          <div style={{ whiteSpace: "pre-line" }}>{mainItems || "No menu available for this period."}</div>
                          {dailyItems && (
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "10px", borderTop: "1px dashed rgba(255,255,255,0.15)", paddingTop: "8px" }}>
                              <strong>Daily Items:</strong> {dailyItems}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 3. Library Catalog Widget */}
          <section className="glass-card">
            <div className="widget-title">
              <span>MGCL Live Catalog Search</span>
            </div>
            <div className="search-container">
              <input
                type="text"
                className="search-input"
                placeholder="Search algorithms, physics, C++..."
                value={libQuery}
                onChange={(e) => setLibQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchLibrary()}
              />
              <button className="btn-primary" onClick={searchLibrary} disabled={libLoading}>
                {libLoading ? "Searching..." : "Search"}
              </button>
            </div>
            <div className="book-results">
              {libResults ? (
                libResults.books && libResults.books.length > 0 ? (
                  libResults.books.map((book: any, idx: number) => (
                    <div key={idx} className="book-card">
                      <div>
                        <div style={{ fontWeight: 600 }}>{book.title}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                          By {book.authors.join(", ")}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--color-accent)", marginTop: "2px" }}>
                          📍 {book.location} | {book.callNumber}
                        </div>
                      </div>
                      <span className={`badge ${book.status === "Available" ? "badge-success" : "badge-danger"}`}>
                        {book.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "10px 0" }}>
                    No books matching query.
                  </div>
                )
              ) : (
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
                  Search queries pull live books from the Open Library API and overlays local MGCL location indexes.
                </div>
              )}
            </div>
          </section>

          {/* 4. Events & Fests Widget */}
          <section className="glass-card">
            <div className="widget-title">
              <span>Campus Events & Workshops</span>
            </div>
            <div className="book-results" style={{ maxHeight: "190px" }}>
              {eventsLoading ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Loading events stream...
                </div>
              ) : upcomingEvents && upcomingEvents.length > 0 ? (
                upcomingEvents.map((evt, idx) => {
                  const dayStr = evt.date.split("-")[2] || "20";
                  return (
                    <div key={idx} className="event-item">
                      <div className="event-date-badge">
                        <span className="event-date-day">{dayStr}</span>
                        <span className="event-date-month">Jun</span>
                      </div>
                      <div className="event-details">
                        <span className="event-name">{evt.eventName}</span>
                        <span style={{ fontSize: "0.7rem", color: "var(--color-accent)", fontWeight: 600 }}>
                          {evt.clubName}
                        </span>
                        <span className="event-venue">
                          🕒 {evt.time} | 📍 {evt.venue}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  No upcoming events registered.
                </div>
              )}
            </div>
          </section>

          {/* 5. Academics Calendar Preview */}
          <section className="glass-card" style={{ gridColumn: "span 2" }}>
            <div className="widget-title">
              <span>Academic Autumn Calendar (Autumn 26-27)</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="search-input"
                  style={{ width: "150px", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem" }}
                  placeholder="Exams, classes, fests..."
                  value={acadQuery}
                  onChange={(e) => setAcadQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchAcademics()}
                />
                <button className="btn-accent" onClick={() => searchAcademics()} disabled={acadLoading}>
                  Search
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: "15px", maxHeight: "160px", overflowY: "auto", flexDirection: "column" }}>
              {acadLoading ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Searching database...
                </div>
              ) : acadResults.length > 0 ? (
                acadResults.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(75,85,99,0.15)", paddingBottom: "6px", fontSize: "0.8rem" }}>
                    <span style={{ fontWeight: 500 }}>{item.event}</span>
                    <span style={{ color: "var(--color-accent)", fontWeight: 600, flexShrink: 0 }}>
                      {item.date} ({item.day})
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  Type in the box above to look up exam schedules, orientation, registration, or holidays.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* MCP PROTOCOL INSPECTOR */}
        <section className="glass-card mcp-inspector-card">
          <div 
            className="widget-title" 
            style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            onClick={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>MCP Protocol Inspector Console</span>
              <span style={{ fontSize: "0.7rem", textTransform: "none", color: "var(--text-muted)" }}>
                {isInspectorCollapsed ? "(Collapsed - Click to Expand)" : "(Expanded - Click to Minimize)"}
              </span>
            </div>
            <button 
              className="btn-accent" 
              style={{ padding: "4px 10px", fontSize: "0.7rem" }}
              onClick={(e) => {
                e.stopPropagation();
                setIsInspectorCollapsed(!isInspectorCollapsed);
              }}
            >
              {isInspectorCollapsed ? "Expand Console" : "Collapse Console"}
            </button>
          </div>
          
          {!isInspectorCollapsed && (
            <div className="inspector-console">
              {mcpLogs.length === 0 ? (
                <div className="console-placeholder">
                  Assistant has not queried the MCP Servers yet. Ask questions in the chat assistant (e.g. "What is for lunch?" or "Is there rain in Roorkee?") to trigger MCP protocol transactions.
                </div>
              ) : (
                mcpLogs.map((log) => (
                  <div key={log.id} className="log-line">
                    <span className={`log-header-badge ${log.direction === "client-to-server" ? "log-req" : "log-res"}`}>
                      {log.direction === "client-to-server" ? "Request" : "Response"}
                    </span>
                    <span className="log-server-name">{log.server.toUpperCase()}_MCP_SERVER</span>
                    <span style={{ color: "#8b949e", marginRight: "6px" }}>method:</span>
                    <span style={{ color: "#ff7b72" }}>"{log.method}"</span>
                    <span className="log-details">
                      {JSON.stringify(log.payload, null, 2)}
                    </span>
                  </div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>
          )}
        </section>
      </main>

      {/* RIGHT COLUMN: AI Assistant Panel */}
      <aside className="assistant-panel">
        <div className="widget-title">
          <span>AI Assistant (Friday)</span>
        </div>

        <div className="chat-messages-container">
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-row ${msg.role}`}>
              <div className={`chat-bubble ${msg.role}`}>
                {msg.role === "assistant" ? (
                  <div className="markdown-text" dangerouslySetInnerHTML={{ 
                    __html: msg.content
                      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                      .replace(/\n/g, "<br/>") 
                  }} />
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="chat-row assistant">
              <div className="chat-bubble assistant" style={{ fontStyle: "italic", color: "var(--text-muted)" }}>
                Thinking and querying MCP servers...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Suggestion Chips */}
        <div className="suggested-chips">
          <button className="chip" onClick={() => sendChatMessage("What's for lunch today?")}>
            What's for lunch?
          </button>
          <button className="chip" onClick={() => sendChatMessage("What is the cutoff for Computer Science branch change?")}>
            CSE Cutoff?
          </button>
          <button className="chip" onClick={() => sendChatMessage("Tell me the lawn rule and some inane campus rules")}>
            Campus Rules?
          </button>
          <button className="chip" onClick={() => sendChatMessage("Is there rain in Roorkee today?")}>
            Roorkee Weather?
          </button>
          <button className="chip" onClick={() => sendChatMessage("Search for 'Introduction to Algorithms' in the library")}>
            Find Cormen book?
          </button>
        </div>

        <div className="chat-input-container">
          <input
            type="text"
            className="chat-input"
            placeholder="Type your campus query..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
            disabled={chatLoading}
          />
          <button className="btn-primary" onClick={() => sendChatMessage()} disabled={chatLoading}>
            Send
          </button>
        </div>
      </aside>
    </div>
  );
}
