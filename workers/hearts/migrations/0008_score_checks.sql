-- Fair leaderboards (quick checks): when each device last sent a round for each game, so a round
-- can't claim to have lasted longer than the time since the last one, and scores the checks
-- turned away (kept 30 days so odd patterns can be looked at; never shown on a board).
CREATE TABLE IF NOT EXISTS score_last (
  game   TEXT    NOT NULL,
  device TEXT    NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (game, device)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS score_flags (
  game   TEXT    NOT NULL,
  device TEXT    NOT NULL,
  score  INTEGER NOT NULL,
  secs   REAL,
  why    TEXT    NOT NULL,
  at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS score_flags_at ON score_flags (at);
