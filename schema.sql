-- Create short_links table
CREATE TABLE IF NOT EXISTS short_links (
  id SERIAL PRIMARY KEY,
  short_id VARCHAR(20) UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
