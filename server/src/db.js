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
  -- 'ok' | 'login_required' | 'error'. Kept current by sync, balances and
  -- ITEM webhooks so a broken connection is visible instead of silently stale.
  status TEXT NOT NULL DEFAULT 'ok',
  error_code TEXT,
  last_synced_at TIMESTAMPTZ,
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

async function getAccountsForItem(itemId) {
  const { rows } = await pool.query('SELECT * FROM accounts WHERE item_id = $1 ORDER BY id', [itemId])
  return rows
}

async function setItemStatus(itemId, status, errorCode = null) {
  await pool.query('UPDATE items SET status = $2, error_code = $3 WHERE item_id = $1', [itemId, status, errorCode])
}

async function markItemSynced(itemId) {
  await pool.query(
    "UPDATE items SET status = 'ok', error_code = NULL, last_synced_at = now() WHERE item_id = $1",
    [itemId],
  )
}

// pg returns DATE columns as JS Dates, which res.json would serialize as
// full ISO timestamps; the API contract is a plain YYYY-MM-DD string.
function toDateString(value) {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

// One definition of "a transfer", shared by the list filter and the daily
// totals so they can't disagree. A user's category edit wins over Plaid's.
const TRANSFER_PREDICATE = `(COALESCE(o.category, '') = 'Transfer' OR (o.category IS NULL AND COALESCE(t.personal_finance_category, '') LIKE 'TRANSFER%'))`

// FROM/WHERE for a user's live transactions plus optional filters. Every value
// is bound as a parameter; only fixed clauses are interpolated.
function transactionScope(clerkUserId, filters) {
  const where = ['i.clerk_user_id = $1', 't.is_removed = false']
  const params = [clerkUserId]
  const bind = (clause, value) => {
    params.push(value)
    where.push(`${clause} $${params.length}`)
  }
  if (filters.start) bind('t.date >=', filters.start)
  if (filters.end) bind('t.date <=', filters.end)
  if (filters.accountId) bind('t.account_id =', filters.accountId)
  if (filters.pendingOnly) where.push('t.pending = true')
  if (filters.incomeOnly) where.push('t.amount < 0')
  if (filters.excludeTransfers) where.push(`NOT ${TRANSFER_PREDICATE}`)
  return {
    from: `FROM transactions t
       JOIN accounts a ON a.account_id = t.account_id
       JOIN items i ON i.item_id = a.item_id
       LEFT JOIN transaction_overrides o
         ON o.transaction_id = t.transaction_id AND o.clerk_user_id = i.clerk_user_id
      WHERE ${where.join(' AND ')}`,
    params,
  }
}

async function getTransactionsForUser(clerkUserId, { limit = 100, offset = 0, ...filters } = {}) {
  const { from, params } = transactionScope(clerkUserId, filters)
  const { rows } = await pool.query(
    `SELECT t.*, a.name AS account_name, i.institution_name,
            o.merchant_name AS override_merchant_name,
            o.category AS override_category
       ${from}
      ORDER BY t.date DESC, t.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )
  return rows.map((row) => ({
    ...row,
    date: toDateString(row.date),
    authorized_date: toDateString(row.authorized_date),
  }))
}

async function countTransactionsForUser(clerkUserId, filters = {}) {
  const { from, params } = transactionScope(clerkUserId, filters)
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n ${from}`, params)
  return rows[0].n
}

const cents = (value) => Math.round(value * 100) / 100

// Per-day totals over every synced transaction since `start`. The client used
// to derive these from a single page of 200 rows, which silently flattened any
// history older than that page. Aggregated here, only the totals cross the
// wire, and nothing is truncated.
async function getDailyTotals(clerkUserId, start) {
  const { from, params } = transactionScope(clerkUserId, { start })
  const { rows } = await pool.query(
    `SELECT t.date, t.amount, ${TRANSFER_PREDICATE} AS is_transfer ${from} ORDER BY t.date`,
    params,
  )
  const byDay = new Map()
  for (const row of rows) {
    const date = toDateString(row.date)
    // pg returns NUMERIC as a string.
    const amount = Number(row.amount)
    const day = byDay.get(date) || { date, net: 0, income: 0, spending: 0 }
    // Plaid amounts are positive for money out; net worth moves by the negation.
    day.net -= amount
    if (!row.is_transfer) {
      if (amount < 0) day.income -= amount
      else day.spending += amount
    }
    byDay.set(date, day)
  }
  // Rows arrive date-ordered, so the Map already iterates oldest-first.
  return [...byDay.values()].map((day) => ({
    date: day.date,
    net: cents(day.net),
    income: cents(day.income),
    spending: cents(day.spending),
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

const OVERRIDE_COLUMNS = { merchantName: 'merchant_name', category: 'category' }

// Partial: only the fields present in `patch` are written, so renaming a
// merchant can't wipe a category edit (it used to — every write upserted both
// columns, nulling whichever one the request left out). A field set to null
// resets just that field.
async function setTransactionOverride(clerkUserId, transactionId, patch) {
  const fields = Object.keys(OVERRIDE_COLUMNS).filter((key) => key in patch)
  if (fields.length === 0) return
  const columns = fields.map((key) => OVERRIDE_COLUMNS[key])
  await pool.query(
    `INSERT INTO transaction_overrides (clerk_user_id, transaction_id, ${columns.join(', ')})
     VALUES ($1, $2, ${columns.map((_, i) => `$${i + 3}`).join(', ')})
     ON CONFLICT (clerk_user_id, transaction_id) DO UPDATE SET
       ${columns.map((column) => `${column} = EXCLUDED.${column}`).join(', ')},
       updated_at = now()`,
    [clerkUserId, transactionId, ...fields.map((key) => patch[key])],
  )
  // A row with nothing left overridden is the same as no row.
  await pool.query(
    `DELETE FROM transaction_overrides
      WHERE clerk_user_id = $1 AND transaction_id = $2 AND merchant_name IS NULL AND category IS NULL`,
    [clerkUserId, transactionId],
  )
}

async function clearTransactionOverride(clerkUserId, transactionId) {
  await pool.query('DELETE FROM transaction_overrides WHERE clerk_user_id = $1 AND transaction_id = $2', [
    clerkUserId,
    transactionId,
  ])
}

async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Transactions and overrides hang off account_id / transaction_id rather than
// a foreign key, so they're swept explicitly — set-based, and inside one
// database transaction so a failure part-way can't leave half a bank behind.
// Every statement is scoped by clerk_user_id, so it's a no-op on someone
// else's item.
async function deleteItem(clerkUserId, itemId) {
  const ownedAccounts = `SELECT a.account_id FROM accounts a JOIN items i ON i.item_id = a.item_id
                          WHERE i.clerk_user_id = $1 AND a.item_id = $2`
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM transaction_overrides WHERE clerk_user_id = $1 AND transaction_id IN (
         SELECT transaction_id FROM transactions WHERE account_id IN (${ownedAccounts}))`,
      [clerkUserId, itemId],
    )
    await client.query(`DELETE FROM transactions WHERE account_id IN (${ownedAccounts})`, [clerkUserId, itemId])
    await client.query(`DELETE FROM accounts WHERE account_id IN (${ownedAccounts})`, [clerkUserId, itemId])
    await client.query('DELETE FROM items WHERE clerk_user_id = $1 AND item_id = $2', [clerkUserId, itemId])
  })
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
  getAccountsForItem,
  setItemStatus,
  markItemSynced,
  getTransactionsForUser,
  countTransactionsForUser,
  getDailyTotals,
  ownsTransaction,
  setTransactionOverride,
  clearTransactionOverride,
  withTransaction,
  deleteItem,
  toDateString,
}
