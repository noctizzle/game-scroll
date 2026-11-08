-- Leaderboards: each install's best score per game, all time and per day (UTC).
-- board: 'all' or 'd' + days since 1970-01-01, e.g. 'd20400'. Names are made up from the device id.
CREATE TABLE IF NOT EXISTS scores (
  game   TEXT    NOT NULL,
  board  TEXT    NOT NULL,
  device TEXT    NOT NULL,
  score  INTEGER NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (game, board, device)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS scores_rank ON scores (game, board, score DESC);
