const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

// Load DB ONLY ONCE
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

// ----------------- CORS -----------------
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use(express.json());

// ----------------- Root -----------------
app.get("/", (req, res) => {
  res.send("TinyLink Backend Running");
});

// ----------------- Helpers -----------------
const CODE_REGEX = /^[A-Za-z0-9]{6,8}$/;

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function generateCode(length = 6) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ----------------- Create link -----------------
app.post("/api/links", async (req, res) => {
  try {
    const { targetUrl, code: custom } = req.body;

    if (!targetUrl) {
      return res.status(400).json({ error: "targetUrl is required" });
    }

    if (!isValidUrl(targetUrl)) {
      return res.status(400).json({ error: "Invalid URL" });
    }

    let finalCode = custom?.trim();

    if (finalCode) {
      if (!CODE_REGEX.test(finalCode)) {
        return res.status(400).json({
          error: "Custom code must be 6-8 alphanumeric characters",
        });
      }

      const exists = await pool.query(
        "SELECT short_id FROM short_links WHERE short_id=$1",
        [finalCode]
      );

      if (exists.rows.length > 0) {
        return res.status(409).json({ error: "Short code already exists" });
      }
    } else {
      let unique = false;
      while (!unique) {
        const candidate = generateCode(6);
        const exists = await pool.query(
          "SELECT short_id FROM short_links WHERE short_id=$1",
          [candidate]
        );
        if (exists.rows.length === 0) {
          finalCode = candidate;
          unique = true;
        }
      }
    }

    const insert = `
      INSERT INTO short_links (short_id, original_url)
      VALUES ($1, $2)
      RETURNING short_id AS code,
                original_url AS "targetUrl",
                clicks,
                created_at AS "createdAt"
    `;

    const result = await pool.query(insert, [finalCode, targetUrl]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------- Get all links -----------------
app.get("/api/links", async (req, res) => {
  try {
    const query = `
      SELECT short_id AS code,
             original_url AS "targetUrl",
             clicks,
             created_at AS "createdAt"
      FROM short_links
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("List error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------- Delete link -----------------
app.delete("/api/links/:code", async (req, res) => {
  try {
    const del = await pool.query(
      "DELETE FROM short_links WHERE short_id=$1",
      [req.params.code]
    );

    if (del.rowCount === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------- Redirect -----------------
app.get("/:code", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT original_url FROM short_links WHERE short_id=$1",
      [req.params.code]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Not found");
    }

    const target = result.rows[0].original_url;

    await pool.query(
      "UPDATE short_links SET clicks = clicks + 1 WHERE short_id=$1",
      [req.params.code]
    );

    res.redirect(target);
  } catch (err) {
    console.error("Redirect error:", err);
    res.status(500).send("Internal server error");
  }
});

// ----------------- Start -----------------
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
