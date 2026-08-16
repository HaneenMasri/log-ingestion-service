CREATE TABLE IF NOT EXISTS logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  service TEXT NOT NULL,
  message TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Primary query path: time range + deterministic timestamp/id ordering.
CREATE INDEX IF NOT EXISTS logs_timestamp_id_desc_idx
  ON logs (timestamp DESC, id DESC);

-- Exact service + time-range queries and aggregation by service.
CREATE INDEX IF NOT EXISTS logs_service_timestamp_id_idx
  ON logs (service, timestamp DESC, id DESC);

-- Exact level + time-range queries and aggregation by level.
CREATE INDEX IF NOT EXISTS logs_level_timestamp_id_idx
  ON logs (level, timestamp DESC, id DESC);

-- JSONB containment supports attr.<key>=<value> queries.
CREATE INDEX IF NOT EXISTS logs_attributes_gin_idx
  ON logs USING GIN (attributes jsonb_path_ops);
