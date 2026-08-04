const { Pool } = require('pg')

// Canonical DDL. Applied both by node-pg-migrate (see migrations/) and
// available to tests — same pattern as llmjob's server/src/db.js.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  item_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  institution_id TEXT,
  institution_name TEXT,
  transaction_cursor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_clerk_user_idx ON items (clerk_user_id);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
  account_id TEXT NOT NULL UNIQUE,
  name TEXT,
  official_name TEXT,
  mask TEXT,
  type TEXT,
  subtype TEXT,
  current_balance NUMERIC,
  available_balance NUMERIC,
  iso_currency_code TEXT,
  balances_updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS accounts_item_idx ON accounts (item_id);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  date DATE,
  authorized_date DATE,
  name TEXT,
  merchant_name TEXT,
  amount NUMERIC,
  iso_currency_code TEXT,
  personal_finance_category TEXT,
  pending BOOLEAN NOT NULL DEFAULT false,
  is_removed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions (account_id);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date DESC);

-- User edits to a synced transaction. Deliberately a separate table: sync.js
-- upserts the transactions table on every pass and would overwrite any
-- column it owns.
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
`

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/alder',
})

async function addItem(clerkUserId, itemId, accessToken) {
  await pool.query(
    'INSERT INTO items (clerk_user_id, item_id, access_token) VALUES ($1, $2, $3) ON CONFLICT (item_id) DO NOTHING',
    [clerkUserId, itemId, accessToken],
  )
}

async function setInstitution(itemId, institutionId, institutionName) {
  await pool.query('UPDATE items SET institution_id = $2, institution_name = $3 WHERE item_id = $1', [
    itemId,
    institutionId,
    institutionName,
  ])
}

async function getItemsForUser(clerkUserId) {
  const { rows } = await pool.query('SELECT * FROM items WHERE clerk_user_id = $1 ORDER BY id', [clerkUserId])
  return rows
}

async function getItemByItemId(itemId) {
  const { rows } = await pool.query('SELECT * FROM items WHERE item_id = $1', [itemId])
  return rows[0]
}

async function saveCursor(itemId, cursor) {
  await pool.query('UPDATE items SET transaction_cursor = $2 WHERE item_id = $1', [itemId, cursor])
}

async function upsertAccount(itemId, account) {
  const balances = account.balances || {}
  await pool.query(
    `INSERT INTO accounts
       (item_id, account_id, name, official_name, mask, type, subtype,
        current_balance, available_balance, iso_currency_code, balances_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (account_id) DO UPDATE SET
       name = EXCLUDED.name,
       official_name = EXCLUDED.official_name,
       mask = EXCLUDED.mask,
       type = EXCLUDED.type,
       subtype = EXCLUDED.subtype,
       current_balance = EXCLUDED.current_balance,
       available_balance = EXCLUDED.available_balance,
       iso_currency_code = EXCLUDED.iso_currency_code,
       balances_updated_at = now()`,
    [
      itemId,
      account.account_id,
      account.name,
      account.official_name,
      account.mask,
      account.type,
      account.subtype,
      balances.current,
      balances.available,
      balances.iso_currency_code,
    ],
  )
}

async function upsertTransaction(txn) {
  await pool.query(
    `INSERT INTO transactions
       (account_id, transaction_id, date, authorized_date, name, merchant_name,
        amount, iso_currency_code, personal_finance_category, pending, is_removed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
     ON CONFLICT (transaction_id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       date = EXCLUDED.date,
       authorized_date = EXCLUDED.authorized_date,
       name = EXCLUDED.name,
       merchant_name = EXCLUDED.merchant_name,
       amount = EXCLUDED.amount,
       iso_currency_code = EXCLUDED.iso_currency_code,
       personal_finance_category = EXCLUDED.personal_finance_category,
       pending = EXCLUDED.pending,
       is_removed = false`,
    [
      txn.account_id,
      txn.transaction_id,
      txn.date,
      txn.authorized_date,
      txn.name,
      txn.merchant_name,
      txn.amount,
      txn.iso_currency_code,
      txn.personal_finance_category?.primary ?? null,
      txn.pending,
    ],
  )
}

async function markTransactionRemoved(transactionId) {
  await pool.query('UPDATE transactions SET is_removed = true WHERE transaction_id = $1', [transactionId])
}

async function getAccountsForUser(clerkUserId) {
  const { rows } = await pool.query(
    `SELECT a.*, i.institution_name
       FROM accounts a
       JOIN items i ON i.item_id = a.item_id
      WHERE i.clerk_user_id = $1
      ORDER BY a.id`,
    [clerkUserId],
  )
  return rows
}

// pg returns DATE columns as JS Dates, which res.json would serialize as
// full ISO timestamps; the API contract is a plain YYYY-MM-DD string.
function toDateString(value) {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

async function getTransactionsForUser(clerkUserId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT t.*, a.name AS account_name, i.institution_name,
            o.merchant_name AS override_merchant_name,
            o.category AS override_category
       FROM transactions t
       JOIN accounts a ON a.account_id = t.account_id
       JOIN items i ON i.item_id = a.item_id
       LEFT JOIN transaction_overrides o
         ON o.transaction_id = t.transaction_id AND o.clerk_user_id = i.clerk_user_id
      WHERE i.clerk_user_id = $1 AND t.is_removed = false
      ORDER BY t.date DESC, t.id DESC
      LIMIT $2`,
    [clerkUserId, limit],
  )
  return rows.map((row) => ({
    ...row,
    date: toDateString(row.date),
    authorized_date: toDateString(row.authorized_date),
  }))
}

// Ownership is proven by joining back through accounts -> items, so a user can
// only ever override a transaction that arrived on one of their own items.
async function ownsTransaction(clerkUserId, transactionId) {
  const { rows } = await pool.query(
    `SELECT 1
       FROM transactions t
       JOIN accounts a ON a.account_id = t.account_id
       JOIN items i ON i.item_id = a.item_id
      WHERE i.clerk_user_id = $1 AND t.transaction_id = $2
      LIMIT 1`,
    [clerkUserId, transactionId],
  )
  return rows.length > 0
}

async function setTransactionOverride(clerkUserId, transactionId, { merchantName, category }) {
  await pool.query(
    `INSERT INTO transaction_overrides (clerk_user_id, transaction_id, merchant_name, category)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (clerk_user_id, transaction_id) DO UPDATE SET
       merchant_name = EXCLUDED.merchant_name,
       category = EXCLUDED.category,
       updated_at = now()`,
    [clerkUserId, transactionId, merchantName ?? null, category ?? null],
  )
}

async function clearTransactionOverride(clerkUserId, transactionId) {
  await pool.query('DELETE FROM transaction_overrides WHERE clerk_user_id = $1 AND transaction_id = $2', [
    clerkUserId,
    transactionId,
  ])
}

// Deleting the item cascades to its accounts; transactions and overrides are
// keyed by account_id / transaction_id rather than by a foreign key, so they
// are swept explicitly first.
async function deleteItem(clerkUserId, itemId) {
  const { rows } = await pool.query(
    'SELECT a.account_id FROM accounts a JOIN items i ON i.item_id = a.item_id WHERE i.clerk_user_id = $1 AND a.item_id = $2',
    [clerkUserId, itemId],
  )
  for (const { account_id: accountId } of rows) {
    const { rows: txns } = await pool.query('SELECT transaction_id FROM transactions WHERE account_id = $1', [accountId])
    for (const { transaction_id: transactionId } of txns) {
      await pool.query('DELETE FROM transaction_overrides WHERE clerk_user_id = $1 AND transaction_id = $2', [
        clerkUserId,
        transactionId,
      ])
    }
    await pool.query('DELETE FROM transactions WHERE account_id = $1', [accountId])
    await pool.query('DELETE FROM accounts WHERE account_id = $1', [accountId])
  }
  await pool.query('DELETE FROM items WHERE clerk_user_id = $1 AND item_id = $2', [clerkUserId, itemId])
}

module.exports = {
  SCHEMA,
  pool,
  addItem,
  setInstitution,
  getItemsForUser,
  getItemByItemId,
  saveCursor,
  upsertAccount,
  upsertTransaction,
  markTransactionRemoved,
  getAccountsForUser,
  getTransactionsForUser,
  ownsTransaction,
  setTransactionOverride,
  clearTransactionOverride,
  deleteItem,
  toDateString,
}
