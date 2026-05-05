-- CheckWA initial schema
-- ARC-04: replaces in-memory results[] array with normalized rows.
-- Apply with: psql -d checkwa -f migrations/001_initial_schema.sql
-- (or the equivalent for your chosen DB driver)

CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'done', 'error')),
  engine        VARCHAR(20)
                  CHECK (engine IN ('waba', 'scraping')),
  total         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS job_results (
  id         BIGSERIAL PRIMARY KEY,
  job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  number     VARCHAR(20) NOT NULL,
  status     VARCHAR(10) NOT NULL CHECK (status IN ('valid', 'invalid', 'error')),
  wa_id      VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_results_job_id ON job_results(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status        ON jobs(status);
