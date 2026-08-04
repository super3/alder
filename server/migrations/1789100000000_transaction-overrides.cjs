/* eslint-disable camelcase */
// User edits to synced transactions. Kept in their own table because
// sync.js upserts `transactions` on every pass and would clobber any
// column it owns. The canonical DDL lives in server/src/db.js (SCHEMA).
exports.shorthands = undefined

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS transaction_overrides (
      id SERIAL PRIMARY KEY,
      clerk_user_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      merchant_name TEXT,
      category TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (clerk_user_id, transaction_id)
    );
    CREATE INDEX IF NOT EXISTS overrides_user_idx ON transaction_overrides (clerk_user_id);
  `)
}

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS transaction_overrides;')
}
