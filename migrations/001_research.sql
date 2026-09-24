CREATE TABLE IF NOT EXISTS studium_worlds (
  world_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS studium_documents (
  kind text NOT NULL CHECK (kind IN ('bundle','config','proposal','report')),
  id text NOT NULL,
  world_id text NOT NULL REFERENCES studium_worlds(world_id),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retracted_at timestamptz,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS studium_documents_world ON studium_documents(world_id, kind);
CREATE TABLE IF NOT EXISTS studium_history (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  world_id text NOT NULL REFERENCES studium_worlds(world_id),
  kind text NOT NULL,
  id text NOT NULL,
  actor text NOT NULL,
  action text NOT NULL CHECK (action IN ('create','replace','retract','restore')),
  before_value jsonb,
  after_value jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studium_history_world ON studium_history(world_id, sequence);
