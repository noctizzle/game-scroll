-- App Attest keys: one per iOS install, made in the phone's Secure Enclave and attested by Apple.
-- counter must go up with every assertion, so a captured assertion can't be replayed.
CREATE TABLE IF NOT EXISTS appattest_keys (
  key_id     TEXT    PRIMARY KEY,   -- base64url SHA-256 of the public key
  public_key BLOB    NOT NULL,      -- SPKI (DER)
  counter    INTEGER NOT NULL,
  device     TEXT    NOT NULL,      -- the app's anonymous device id when the key was attested
  env        TEXT    NOT NULL,      -- production | development
  created    INTEGER NOT NULL
) WITHOUT ROWID;
