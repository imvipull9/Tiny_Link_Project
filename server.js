const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

// Load DB connection
require("./db");
const pool = require("./db");


const app = express();

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

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

function generateRandomCode(length = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ----------------- Healthcheck -----------------
app.get("/healthz", (req, res) => {
  res.status(200).json({
    ok: true,
    version: "1.0",
    uptime: process.uptime(),
  });
});

// ----------------- Create short link -----------------
app.post("/api/links", async (req, res) => {
  try {
    const { targetUrl, code: customCode } = req.body;

    if (!targetUrl) {
      return res.status(400).json({ error: "targetUrl is required" });
    }

    if (!isValidUrl(targetUrl)) {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    let finalCode = customCode?.trim();

    // If custom code provided
    if (finalCode) {
      if (!CODE_REGEX.test(finalCode)) {
        return res.status(400).json({
          error: "Custom code must be 6–8 alphanumeric characters",
        });
      }

      const existing = await pool.query(
        "SELECT short_id FROM short_links WHERE short_id = $1",
        [finalCode]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "Short code already exists" });
      }
    } else {
      // Generate unique code
      let isUnique = false;
      while (!isUnique) {
        const candidate = generateRandomCode(6);
        const existing = await pool.query(
          "SELECT short_id FROM short_links WHERE short_id = $1",
          [candidate]
        );
        if (existing.rows.length === 0) {
          finalCode = candidate;
          isUnique = true;
        }
      }
    }

    const insertQuery = `
      INSERT INTO short_links (short_id, original_url)
      VALUES ($1, $2)
      RETURNING short_id AS code,
                original_url AS "targetUrl",
                clicks,
                created_at AS "createdAt"
    `;

    const result = await pool.query(insertQuery, [finalCode, targetUrl]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create link error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------- List all links -----------------
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
    console.error("List links error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------- Get link stats -----------------
app.get("/api/links/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const query = `
      SELECT short_id AS code,
             original_url AS "targetUrl",
             clicks,
             created_at AS "createdAt"
      FROM short_links
      WHERE short_id = $1
    `;

    const result = await pool.query(query, [code]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Short code not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------- Delete link -----------------
app.delete("/api/links/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const deleteResult = await pool.query(
      "DELETE FROM short_links WHERE short_id = $1",
      [code]
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: "Short code not found" });
    }

    res.json({ ok: true, message: "Link deleted" });
  } catch (err) {
    console.error("Delete link error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------- Redirect -----------------
app.get("/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      "SELECT original_url FROM short_links WHERE short_id = $1",
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Short link not found");
    }

    const targetUrl = result.rows[0].original_url;

    await pool.query(
      "UPDATE short_links SET clicks = clicks + 1 WHERE short_id = $1",
      [code]
    );

    res.redirect(302, targetUrl);
  } catch (err) {
    console.error("Redirect error:", err);
    res.status(500).send("Internal server error");
  }
});

// ----------------- Start server -----------------
app.listen(PORT, () => {
  console.log(`TinyLink backend running on port ${PORT}`);
});
