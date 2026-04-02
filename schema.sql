CREATE TABLE IF NOT EXISTS onsite_events (
  id BIGSERIAL PRIMARY KEY,
  lab_raw TEXT NOT NULL,
  lab_key TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  tech_count NUMERIC(10,2) NOT NULL CHECK (tech_count >= 0),
  source_filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT onsite_events_key UNIQUE (lab_key, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_onsite_events_start_end ON onsite_events (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_onsite_events_lab_key ON onsite_events (lab_key);

CREATE TABLE IF NOT EXISTS upload_batches (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  removed_count INTEGER NOT NULL DEFAULT 0
);
