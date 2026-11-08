-- Challenges already spent on a pass, so each one makes at most one pass (one device).
-- Kept until they expire (5 minutes); older rows are dropped now and then.
CREATE TABLE IF NOT EXISTS used_challenges (
  challenge TEXT    PRIMARY KEY,
  expires   INTEGER NOT NULL
) WITHOUT ROWID;
