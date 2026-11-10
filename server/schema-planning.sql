CREATE TABLE IF NOT EXISTS shared_planning (
  id integer PRIMARY KEY CHECK (id = 1),
  revision integer NOT NULL CHECK (revision > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
