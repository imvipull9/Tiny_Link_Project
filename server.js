const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

// Connect DB
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------- CORS ----------------------
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN, // only Vercel frontend allowed
    methods: ["GET", "POST", "DELETE"],
  })
);

app.use(express.json());

// ---------------------- Root ----------------------
app.get("/", (req, res) => {
  res.send("TinyLink Backend is Running Successfully 🚀");
});

// ---------------------- Helpers ----------------------
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
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// ---------------------- CREATE SHORT LINK ----------------------
app.post("/api/links", async (req, res) => {
  try {
    const { original_url, short_id } = req.body;

    if (!original_url || !isValidUrl(original_url)) {
      return res.status(400).json({ error: "Valid original_url is required" });
    }

    let finalCode = short_id?.trim();

    // Custom short id
    if (finalCode) {
      const exists = await pool.query(
        "SELECT short_id FROM short_links WHERE short_id = $1",
        [finalCode]
      );

      if (exists.rows.length > 0) {
        return res.status(409).json({ error: "Short ID already exists" });
      }
    } else {
      // Auto-generate unique short id
      let unique = false;
      while (!unique) {
        const candidate = generateCode(6);
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

    const insertQuery = `
      INSERT INTO short_links (short_id, original_url)
      VALUES ($1, $2)
      RETURNING short_id, original_url, clicks, created_at
    `;

    const result = await pool.query(insertQuery, [finalCode, original_url]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create error:", err);
    res.status(500).json({ error: "Server error while creating link" });
  }
});

// ---------------------- LIST ALL LINKS ----------------------
app.get("/api/links", async (req, res) => {
  try {
    const q = `
      SELECT short_id, original_url, clicks, created_at
      FROM short_links
      ORDER BY created_at DESC
    `;
    const result = await pool.query(q);
    res.json(result.rows);
  } catch (err) {
    console.error("List error:", err);
    res.status(500).json({ error: "Server error while fetching links" });
  }
});

// ---------------------- DELETE LINK ----------------------
app.delete("/api/links/:short_id", async (req, res) => {
  try {
    const deleted = await pool.query(
      "DELETE FROM short_links WHERE short_id = $1",
      [req.params.short_id]
    );

    if (deleted.rowCount === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Server error while deleting link" });
  }
});

// ---------------------- REDIRECT (MUST BE LAST ROUTE) ----------------------
app.get("/:short_id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT original_url FROM short_links WHERE short_id = $1",
      [req.params.short_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Short URL not found");
    }

    const target = result.rows[0].original_url;

    await pool.query(
      "UPDATE short_links SET clicks = clicks + 1 WHERE short_id = $1",
      [req.params.short_id]
    );

    return res.redirect(target);
  } catch (err) {
    console.error("Redirect error:", err);
    res.status(500).send("Internal server error");
  }
});

// ---------------------- SERVER START ----------------------
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
