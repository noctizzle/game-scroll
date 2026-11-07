-- Anonymous performance and crash reports, added up per day. Nothing per person: rows are keyed by
-- game, phone model and app build only.

-- How smoothly each game runs on each kind of phone. form: "phone" (normal screen) or "wide"
-- (tablet-sized, like an unfolded Galaxy Z Fold). Frames are timed only while a round is playing.
--   frames: frames drawn; ms: time those frames took; work_ms: time the app spent working on them
--   slow: frames that took 25 ms or more (under 40 fps); hitches: 70 ms or more (a visible freeze)
--   worst_ms: the longest single frame
CREATE TABLE IF NOT EXISTS perf (
  day      INTEGER NOT NULL,   -- days since 1970-01-01 (UTC)
  game     TEXT    NOT NULL,
  platform TEXT    NOT NULL,   -- ios / android / web
  model    TEXT    NOT NULL,   -- e.g. SM-F966B, iPhone17,1
  form     TEXT    NOT NULL,
  app      TEXT    NOT NULL,   -- app build, e.g. 1.0.57 (a1b2c3d)
  rounds   INTEGER NOT NULL DEFAULT 0,
  frames   INTEGER NOT NULL DEFAULT 0,
  ms       INTEGER NOT NULL DEFAULT 0,
  work_ms  INTEGER NOT NULL DEFAULT 0,
  slow     INTEGER NOT NULL DEFAULT 0,
  hitches  INTEGER NOT NULL DEFAULT 0,
  worst_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, game, platform, model, form, app)
) WITHOUT ROWID;

-- Script errors and crashes. kind: "error" (a script error; the game's round was ended) or
-- "crash" (the app closed or reloaded while open, without going to the background first).
-- game is "" when no game was on screen.
CREATE TABLE IF NOT EXISTS crashes (
  day      INTEGER NOT NULL,
  kind     TEXT    NOT NULL,
  game     TEXT    NOT NULL,
  msg      TEXT    NOT NULL,
  place    TEXT    NOT NULL,   -- file:line where it happened, if known
  platform TEXT    NOT NULL,
  model    TEXT    NOT NULL,
  os       TEXT    NOT NULL,
  app      TEXT    NOT NULL,
  n        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, game, msg, place, platform, model, os, app)
) WITHOUT ROWID;
