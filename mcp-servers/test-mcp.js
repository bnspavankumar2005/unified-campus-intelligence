import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("=========================================");
console.log("IITR Campus Intelligence - DB Verification");
console.log("=========================================");

const dbPath = path.join(__dirname, "db");
const databases = ["library.json", "cafeteria.json", "events.json", "academics.json"];

let dbOk = true;
for (const dbName of databases) {
  try {
    const fullPath = path.join(dbPath, dbName);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File does not exist: ${dbName}`);
    }
    const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    console.log(`✓ Database '${dbName}' verified successfully. (${Object.keys(data).length} root keys found)`);
  } catch (err) {
    console.error(`✗ Error verifying '${dbName}': ${err.message}`);
    dbOk = false;
  }
}

if (!dbOk) {
  process.exit(1);
}

console.log("\n=========================================");
console.log("Pinging Local MCP Express Server Hub...");
console.log("=========================================");

try {
  const res = await fetch("http://localhost:3001/");
  if (res.ok) {
    const health = await res.json();
    console.log("✓ MCP Hub is ONLINE!");
    console.log("Hub details:", JSON.stringify(health, null, 2));
  } else {
    throw new Error(`Server returned status: ${res.status}`);
  }
} catch (err) {
  console.log("ℹ Note: Local MCP server is currently offline (this is expected if you haven't run 'npm run dev' yet).");
  console.log(`  To start the server, run: npm run dev`);
}

console.log("\nDB verification complete! Run 'npm run dev' to start the complete stack.");
