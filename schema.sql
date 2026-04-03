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

CREATE TABLE IF NOT EXISTS std_hours_overrides (
  id BIGSERIAL PRIMARY KEY,
  lab_raw TEXT NOT NULL,
  lab_key TEXT NOT NULL,
  std_hours NUMERIC(12,2) NOT NULL CHECK (std_hours >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  source_filename TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_std_hours_lab_key ON std_hours_overrides (lab_key);
CREATE INDEX IF NOT EXISTS idx_std_hours_effective_dates ON std_hours_overrides (effective_from, effective_to);

CREATE TABLE IF NOT EXISTS scenario_profiles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenario_profiles_updated ON scenario_profiles (updated_at DESC);
