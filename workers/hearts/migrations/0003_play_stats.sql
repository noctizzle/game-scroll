-- Anonymous play stats: daily totals per game, nothing per person.
-- views: the game came up in someone's feed; plays: rounds started; skips: scrolled past within
-- 5 seconds without playing; secs: seconds spent playing.
CREATE TABLE IF NOT EXISTS play_stats (
  game  TEXT    NOT NULL,
  day   INTEGER NOT NULL,   -- days since 1970-01-01 (UTC)
  views INTEGER NOT NULL DEFAULT 0,
  plays INTEGER NOT NULL DEFAULT 0,
  skips INTEGER NOT NULL DEFAULT 0,
  secs  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game, day)
) WITHOUT ROWID;
