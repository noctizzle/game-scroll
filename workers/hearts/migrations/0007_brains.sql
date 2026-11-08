-- Tiny Brains shared learning: each install's latest brain numbers for a game's brain of one shape.
-- Only weights (a packed string), never anything about the player. GET /brain averages them.
CREATE TABLE IF NOT EXISTS brains (
  game   TEXT    NOT NULL,
  name   TEXT    NOT NULL,
  shape  TEXT    NOT NULL,
  device TEXT    NOT NULL,
  w      TEXT    NOT NULL,
  steps  INTEGER NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (game, name, shape, device)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS brains_recent ON brains (game, name, shape, at DESC);
