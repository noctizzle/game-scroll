-- One row per (game, device) heart, so each install counts once per game and can take it back.
CREATE TABLE IF NOT EXISTS hearts (
  game   TEXT    NOT NULL,
  device TEXT    NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (game, device)
) WITHOUT ROWID;

-- Running total per game, so the app's one "all counts" read is a small table scan.
CREATE TABLE IF NOT EXISTS counts (
  game TEXT    PRIMARY KEY,
  n    INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
