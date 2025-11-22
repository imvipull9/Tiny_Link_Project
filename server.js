const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

// DB
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

// ----------------- CORS (FULLY FIXED) -----------------
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN, // MUST match Vercel domain
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

app.use(express.json());

// ----------------- Root Route -----------------
app.get("/", (req, res) => {
  res.send("TinyLink Backend Running Successfully");
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

function generateRandomCode(length = 6) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ----------------- Health Check -----------------
app.get("/healthz", (req, res) => {
  res.json({ ok: true, status: "running" });
});

// ----------------- Create Short URL -----------------
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

    if (finalCode) {
      if (!CODE_REGEX.test(finalCode)) {
        return res
          .status(400)
          .json({ error: "Custom code must be 6–8 alphanumeric chars" });
      }

      const exists = await pool.query(
        "SELECT short_id FROM short_links WHERE short_id = $1",
        [finalCode]
      );

      if (exists.rows.length > 0) {
        return res.status(409).json({ error: "Short code already exists" });
      }
    } else {
      let unique = false;
      while (!unique) {
        const candidate = generateRandomCode(6);
        const exists = await pool.query(
          "SELECT short_id FROM short_links WHERE short_id = $1",
          [candidate]
        );
        if (exists.rows.length === 0) {
          finalCode = candidate;
          unique = true;
        }
      }
    }

    const query = `
      INSERT INTO short_links (short_id, original_url)
      VALUES ($1, $2)
      RETURNING short_id AS code,
                original_url AS "targetUrl",
                clicks,
                created_at AS "createdAt"
    `;

    const result = await pool.query(query, [finalCode, targetUrl]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create link error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------- List All Links -----------------
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

// ----------------- Stats for Single Link -----------------
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
      return res.status(404).json({ error: "Not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------- Delete Link -----------------
app.delete("/api/links/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      "DELETE FROM short_links WHERE short_id = $1",
      [code]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({ ok: true, message: "Deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------- Redirect -----------------
app.get("/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const data = await pool.query(
      "SELECT original_url FROM short_links WHERE short_id = $1",
      [code]
    );

    if (data.rows.length === 0) {
      return res.status(404).send("Short link not found");
    }

    const targetUrl = data.rows[0].original_url;

    await pool.query(
      "UPDATE short_links SET clicks = clicks + 1 WHERE short_id = $1",
      [code]
    );

    res.redirect(targetUrl);
  } catch (err) {
    console.error("Redirect error:", err);
    res.status(500).send("Internal server error");
  }
});

// ----------------- Start Server -----------------
app.listen(PORT, () => {
  console.log(`TinyLink backend running on port ${PORT}`);
});
