/* eslint-disable camelcase */
// Connection health for each Plaid item, so a bank that needs the user to
// sign in again is visible instead of silently serving stale balances. The
// canonical DDL lives in server/src/db.js (SCHEMA).
exports.shorthands = undefined

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok';
    ALTER TABLE items ADD COLUMN IF NOT EXISTS error_code TEXT;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE items DROP COLUMN IF EXISTS last_synced_at;
    ALTER TABLE items DROP COLUMN IF EXISTS error_code;
    ALTER TABLE items DROP COLUMN IF EXISTS status;
  `)
}
