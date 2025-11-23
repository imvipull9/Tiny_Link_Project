const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

// ----------------------------
// Validate ENV
// ----------------------------
if (!process.env.DATABASE_URL) {
  console.error("❌ ERROR: DATABASE_URL is missing in .env");
  process.exit(1);
}

// ----------------------------
// Determine Environment
// ----------------------------
const isProduction = process.env.NODE_ENV === "production";

// ----------------------------
// Create Pool
// ----------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction
    ? { rejectUnauthorized: false } // Required for Neon/Render
    : false, // Local PG does not need SSL
  max: 10, // max concurrent connections (Neon limit friendly)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ----------------------------
// Optional: Test DB Connection Once
// ----------------------------
pool
  .connect()
  .then((client) => {
    console.log("✅ PostgreSQL connected");
    client.release();
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  });

module.exports = pool;
