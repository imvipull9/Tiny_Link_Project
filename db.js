const { Pool } = require("pg");
require("dotenv").config();

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is missing in .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
});

pool.connect()
  .then(() => console.log("PostgreSQL connected"))
  .catch((err) => {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  });

module.exports = pool;
