CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by_user_id TEXT,
  disabled INTEGER NOT NULL DEFAULT 0
);

INSERT INTO invite_codes (code, created_at, disabled) VALUES
('151826', unixepoch() * 1000, 0),
('393119', unixepoch() * 1000, 0),
('628310', unixepoch() * 1000, 0),
('591596', unixepoch() * 1000, 0),
('262077', unixepoch() * 1000, 0),
('963799', unixepoch() * 1000, 0),
('821697', unixepoch() * 1000, 0),
('080261', unixepoch() * 1000, 0),
('514668', unixepoch() * 1000, 0),
('707770', unixepoch() * 1000, 0)
ON CONFLICT(code) DO NOTHING;
