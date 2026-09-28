// db.js exercised against an in-memory Postgres (pg-mem), llmjob-style:
// the same SCHEMA that node-pg-migrate applies in production is applied here.
jest.mock('pg', () => {
  const { newDb } = require('pg-mem')
  const mem = newDb()
  const adapters = mem.adapters.createPg()
  return { Pool: adapters.Pool }
})

const db = require('../src/db')

const baseAccount = (overrides = {}) => ({
  account_id: 'acc_1',
  name: 'Everyday Checking',
  official_name: 'Everyday Checking Account',
  mask: '0000',
  type: 'depository',
  subtype: 'checking',
  balances: { current: 100.5, available: 90.25, iso_currency_code: 'USD' },
  ...overrides,
})

const baseTxn = (overrides = {}) => ({
  account_id: 'acc_1',
  transaction_id: 'txn_1',
  date: '2026-07-10',
  authorized_date: '2026-07-09',
  name: 'Green Basket Market',
  merchant_name: 'Green Basket',
  amount: 86.42,
  iso_currency_code: 'USD',
  personal_finance_category: { primary: 'FOOD_AND_DRINK' },
  pending: false,
  ...overrides,
})

beforeAll(async () => {
  await db.pool.query(db.SCHEMA)
})

describe('items', () => {
  test('addItem inserts and is idempotent on item_id', async () => {
    await db.addItem('user_1', 'item_1', 'access-token-1')
    await db.addItem('user_1', 'item_1', 'access-token-other')

    const items = await db.getItemsForUser('user_1')
    expect(items).toHaveLength(1)
    expect(items[0].access_token).toBe('access-token-1')
  })

  test('getItemByItemId returns the item or undefined', async () => {
    const item = await db.getItemByItemId('item_1')
    expect(item.clerk_user_id).toBe('user_1')
    expect(await db.getItemByItemId('missing')).toBeUndefined()
  })

  test('setInstitution stores id and name', async () => {
    await db.setInstitution('item_1', 'ins_109508', 'First Platypus Bank')
    const item = await db.getItemByItemId('item_1')
    expect(item.institution_id).toBe('ins_109508')
    expect(item.institution_name).toBe('First Platypus Bank')
  })

  test('saveCursor persists the sync cursor', async () => {
    await db.saveCursor('item_1', 'cursor-abc')
    const item = await db.getItemByItemId('item_1')
    expect(item.transaction_cursor).toBe('cursor-abc')
  })

  test('getItemsForUser returns empty for unknown user', async () => {
    expect(await db.getItemsForUser('nobody')).toEqual([])
  })
})

describe('accounts', () => {
  test('upsertAccount inserts then updates on conflict', async () => {
    await db.upsertAccount('item_1', baseAccount())
    let accounts = await db.getAccountsForUser('user_1')
    expect(accounts).toHaveLength(1)
    expect(accounts[0].name).toBe('Everyday Checking')
    expect(Number(accounts[0].current_balance)).toBe(100.5)
    expect(accounts[0].institution_name).toBe('First Platypus Bank')

    await db.upsertAccount('item_1', baseAccount({ name: 'Renamed', balances: { current: 42, available: null, iso_currency_code: 'USD' } }))
    accounts = await db.getAccountsForUser('user_1')
    expect(accounts).toHaveLength(1)
    expect(accounts[0].name).toBe('Renamed')
    expect(Number(accounts[0].current_balance)).toBe(42)
    expect(accounts[0].available_balance).toBeNull()
  })

  test('upsertAccount tolerates a missing balances object', async () => {
    await db.upsertAccount('item_1', { ...baseAccount({ account_id: 'acc_2', name: 'No Balances' }), balances: undefined })
    const accounts = await db.getAccountsForUser('user_1')
    const acc2 = accounts.find((a) => a.account_id === 'acc_2')
    expect(acc2.current_balance).toBeNull()
  })
})

describe('transactions', () => {
  test('upsertTransaction inserts then updates on conflict', async () => {
    await db.upsertTransaction(baseTxn())
    let txns = await db.getTransactionsForUser('user_1')
    expect(txns).toHaveLength(1)
    expect(txns[0].personal_finance_category).toBe('FOOD_AND_DRINK')
    expect(txns[0].account_name).toBe('Renamed')

    await db.upsertTransaction(baseTxn({ amount: 90, pending: true }))
    txns = await db.getTransactionsForUser('user_1')
    expect(txns).toHaveLength(1)
    expect(Number(txns[0].amount)).toBe(90)
    expect(txns[0].pending).toBe(true)
  })

  test('upsertTransaction handles a missing personal_finance_category', async () => {
    await db.upsertTransaction(baseTxn({ transaction_id: 'txn_2', personal_finance_category: undefined }))
    const txns = await db.getTransactionsForUser('user_1')
    const txn2 = txns.find((t) => t.transaction_id === 'txn_2')
    expect(txn2.personal_finance_category).toBeNull()
  })

  test('markTransactionRemoved soft-deletes', async () => {
    await db.markTransactionRemoved('txn_2')
    const txns = await db.getTransactionsForUser('user_1')
    expect(txns.map((t) => t.transaction_id)).not.toContain('txn_2')
  })

  test('getTransactionsForUser respects the limit', async () => {
    await db.upsertTransaction(baseTxn({ transaction_id: 'txn_3', date: '2026-07-12' }))
    const txns = await db.getTransactionsForUser('user_1', { limit: 1 })
    expect(txns).toHaveLength(1)
    expect(txns[0].transaction_id).toBe('txn_3')
  })

  test('getTransactionsForUser returns dates as plain YYYY-MM-DD strings', async () => {
    await db.upsertTransaction(
      baseTxn({ transaction_id: 'txn_4', date: '2026-07-13', authorized_date: undefined }),
    )
    const txns = await db.getTransactionsForUser('user_1')
    const txn4 = txns.find((t) => t.transaction_id === 'txn_4')
    expect(txn4.date).toBe('2026-07-13')
    expect(txn4.authorized_date).toBeNull()
  })
})

describe('toDateString', () => {
  test('serializes JS Dates (how pg returns DATE columns) to YYYY-MM-DD', () => {
    expect(db.toDateString(new Date('2026-07-13T00:00:00Z'))).toBe('2026-07-13')
  })

  test('trims already-string dates and passes nulls through', () => {
    expect(db.toDateString('2026-07-13')).toBe('2026-07-13')
    expect(db.toDateString('2026-07-13T00:00:00.000Z')).toBe('2026-07-13')
    expect(db.toDateString(null)).toBeNull()
  })
})

describe('transaction overrides', () => {
  test('ownsTransaction only matches the transaction owner', async () => {
    await db.upsertTransaction(baseTxn({ transaction_id: 'txn_own' }))
    expect(await db.ownsTransaction('user_1', 'txn_own')).toBe(true)
    expect(await db.ownsTransaction('someone_else', 'txn_own')).toBe(false)
    expect(await db.ownsTransaction('user_1', 'no_such_txn')).toBe(false)
  })

  test('an override rides along on the transaction read', async () => {
    await db.upsertTransaction(baseTxn({ transaction_id: 'txn_ovr' }))
    await db.setTransactionOverride('user_1', 'txn_ovr', {
      merchantName: 'Corner Store',
      category: 'Groceries',
    })

    const txns = await db.getTransactionsForUser('user_1', { limit: 500 })
    const row = txns.find((t) => t.transaction_id === 'txn_ovr')
    expect(row.override_merchant_name).toBe('Corner Store')
    expect(row.override_category).toBe('Groceries')
    // The Plaid-supplied values are untouched, so the edit can be reverted.
    expect(row.merchant_name).toBe('Green Basket')
  })

  const overrideFor = async (transactionId) =>
    (await db.getTransactionsForUser('user_1', { limit: 500 })).find((t) => t.transaction_id === transactionId)

  // Regression: every write used to upsert both columns, so a category edit
  // nulled a merchant rename (and vice versa).
  test('editing one field leaves the other alone', async () => {
    await db.setTransactionOverride('user_1', 'txn_ovr', { merchantName: 'Renamed' })
    await db.setTransactionOverride('user_1', 'txn_ovr', { category: 'Dining out' })

    const row = await overrideFor('txn_ovr')
    expect(row.override_merchant_name).toBe('Renamed')
    expect(row.override_category).toBe('Dining out')
  })

  test('null resets just that field', async () => {
    await db.setTransactionOverride('user_1', 'txn_ovr', { category: null })

    const row = await overrideFor('txn_ovr')
    expect(row.override_merchant_name).toBe('Renamed')
    expect(row.override_category).toBeNull()
  })

  test('resetting the last edited field removes the row entirely', async () => {
    await db.setTransactionOverride('user_1', 'txn_ovr', { merchantName: null })
    const { rows } = await db.pool.query(
      "SELECT COUNT(*)::int AS n FROM transaction_overrides WHERE transaction_id = 'txn_ovr'",
    )
    expect(rows[0].n).toBe(0)
  })

  test('an empty patch writes nothing', async () => {
    await db.setTransactionOverride('user_1', 'txn_ovr', {})
    const row = await overrideFor('txn_ovr')
    expect(row.override_merchant_name).toBeNull()
    expect(row.override_category).toBeNull()
  })

  test('clearing reverts to the Plaid values', async () => {
    await db.setTransactionOverride('user_1', 'txn_ovr', { merchantName: 'Temp' })
    await db.clearTransactionOverride('user_1', 'txn_ovr')
    const txns = await db.getTransactionsForUser('user_1', { limit: 500 })
    const row = txns.find((t) => t.transaction_id === 'txn_ovr')
    // LEFT JOIN with no matching override row yields NULL, not a missing key.
    expect(row.override_merchant_name).toBeNull()
  })

  test('a sync cannot clobber an override', async () => {
    await db.setTransactionOverride('user_1', 'txn_ovr', { merchantName: 'Sticky' })
    // Exactly what sync.js does on the next pass.
    await db.upsertTransaction(baseTxn({ transaction_id: 'txn_ovr', merchant_name: 'Plaid Renamed It' }))

    const txns = await db.getTransactionsForUser('user_1', { limit: 500 })
    const row = txns.find((t) => t.transaction_id === 'txn_ovr')
    expect(row.merchant_name).toBe('Plaid Renamed It')
    expect(row.override_merchant_name).toBe('Sticky')
  })
})

describe('deleteItem', () => {
  test('removes the item and everything hanging off it', async () => {
    await db.addItem('user_del', 'item_del', 'tok')
    await db.upsertAccount('item_del', baseAccount({ account_id: 'acc_del' }))
    await db.upsertTransaction(baseTxn({ transaction_id: 'txn_del', account_id: 'acc_del' }))
    await db.setTransactionOverride('user_del', 'txn_del', { merchantName: 'Gone soon' })

    expect(await db.getAccountsForUser('user_del')).toHaveLength(1)

    await db.deleteItem('user_del', 'item_del')

    expect(await db.getItemsForUser('user_del')).toHaveLength(0)
    expect(await db.getAccountsForUser('user_del')).toHaveLength(0)
    expect(await db.getTransactionsForUser('user_del', { limit: 500 })).toHaveLength(0)
    expect(await db.ownsTransaction('user_del', 'txn_del')).toBe(false)
  })

  test("leaves another user's item alone", async () => {
    await db.addItem('user_keep', 'item_keep', 'tok')
    await db.deleteItem('user_other', 'item_keep')
    expect(await db.getItemsForUser('user_keep')).toHaveLength(1)
  })
})

describe('item health', () => {
  test('setItemStatus records a status and code; markItemSynced clears them and stamps the time', async () => {
    await db.addItem('user_h', 'item_h', 'tok')
    expect((await db.getItemByItemId('item_h')).status).toBe('ok')

    await db.setItemStatus('item_h', 'login_required', 'ITEM_LOGIN_REQUIRED')
    let item = await db.getItemByItemId('item_h')
    expect(item.status).toBe('login_required')
    expect(item.error_code).toBe('ITEM_LOGIN_REQUIRED')
    expect(item.last_synced_at).toBeNull()

    await db.markItemSynced('item_h')
    item = await db.getItemByItemId('item_h')
    expect(item.status).toBe('ok')
    expect(item.error_code).toBeNull()
    expect(item.last_synced_at).not.toBeNull()
  })

  test('setItemStatus defaults the code to null', async () => {
    await db.setItemStatus('item_h', 'error')
    expect((await db.getItemByItemId('item_h')).error_code).toBeNull()
  })

  test('getAccountsForItem returns the stored rows for a stale fallback', async () => {
    await db.upsertAccount('item_h', baseAccount({ account_id: 'acc_h' }))
    const rows = await db.getAccountsForItem('item_h')
    expect(rows.map((r) => r.account_id)).toEqual(['acc_h'])
    expect(Number(rows[0].current_balance)).toBe(100.5)
  })
})

// An isolated user so these assertions don't depend on the fixtures above.
describe('filtered, paged and aggregated reads', () => {
  const q = (overrides) => baseTxn({ account_id: 'acc_q1', ...overrides })

  beforeAll(async () => {
    await db.addItem('user_q', 'item_q', 'tok')
    await db.upsertAccount('item_q', baseAccount({ account_id: 'acc_q1', name: 'Q Checking' }))
    await db.upsertAccount('item_q', baseAccount({ account_id: 'acc_q2', name: 'Q Card' }))
    // Plaid amounts: positive is money out.
    await db.upsertTransaction(q({ transaction_id: 'q_coffee', date: '2026-08-01', amount: 4.5 }))
    await db.upsertTransaction(q({ transaction_id: 'q_rent', date: '2026-08-01', amount: 1200 }))
    await db.upsertTransaction(
      q({ transaction_id: 'q_pay', date: '2026-08-15', amount: -3000, personal_finance_category: { primary: 'INCOME' } }),
    )
    await db.upsertTransaction(
      q({
        transaction_id: 'q_xfer',
        date: '2026-08-15',
        amount: 500,
        personal_finance_category: { primary: 'TRANSFER_OUT' },
      }),
    )
    await db.upsertTransaction(
      q({ transaction_id: 'q_card', account_id: 'acc_q2', date: '2026-09-02', amount: 60, pending: true }),
    )
    await db.upsertTransaction(q({ transaction_id: 'q_old', date: '2025-01-01', amount: 10 }))
  })

  const ids = (rows) => rows.map((r) => r.transaction_id)

  test('date range, inclusive at both ends', async () => {
    const rows = await db.getTransactionsForUser('user_q', { start: '2026-08-01', end: '2026-08-15', limit: 50 })
    expect(ids(rows).sort()).toEqual(['q_coffee', 'q_pay', 'q_rent', 'q_xfer'])
  })

  test('account, pending and income filters', async () => {
    expect(ids(await db.getTransactionsForUser('user_q', { accountId: 'acc_q2', limit: 50 }))).toEqual(['q_card'])
    expect(ids(await db.getTransactionsForUser('user_q', { pendingOnly: true, limit: 50 }))).toEqual(['q_card'])
    expect(ids(await db.getTransactionsForUser('user_q', { incomeOnly: true, limit: 50 }))).toEqual(['q_pay'])
  })

  test('excluding transfers honours a user recategorisation in both directions', async () => {
    await db.setTransactionOverride('user_q', 'q_rent', { category: 'Transfer' })
    await db.setTransactionOverride('user_q', 'q_xfer', { category: 'Savings' })

    const rows = await db.getTransactionsForUser('user_q', { excludeTransfers: true, limit: 50 })

    expect(ids(rows)).not.toContain('q_rent')
    expect(ids(rows)).toContain('q_xfer')
  })

  test('offset pages through the same order', async () => {
    const all = ids(await db.getTransactionsForUser('user_q', { limit: 50 }))
    const second = ids(await db.getTransactionsForUser('user_q', { limit: 2, offset: 2 }))
    expect(second).toEqual(all.slice(2, 4))
  })

  test('count agrees with the filters, not the page size', async () => {
    expect(await db.countTransactionsForUser('user_q')).toBe(6)
    expect(await db.countTransactionsForUser('user_q', { start: '2026-08-01', end: '2026-08-31' })).toBe(4)
    expect(await db.countTransactionsForUser('nobody')).toBe(0)
  })

  test('daily totals cover every transaction since start, with transfers kept out of income and spending', async () => {
    // With the overrides above: rent is now a transfer, the TRANSFER_OUT row isn't.
    const days = await db.getDailyTotals('user_q', '2026-08-01')

    expect(days).toEqual([
      // coffee 4.50 out + rent 1200 out (a transfer now, so net-only)
      { date: '2026-08-01', net: -1204.5, income: 0, spending: 4.5 },
      // pay 3000 in, "savings" 500 out
      { date: '2026-08-15', net: 2500, income: 3000, spending: 500 },
      { date: '2026-09-02', net: -60, income: 0, spending: 60 },
    ])
  })
})

// The client's isTransfer() (src/plaidMapping.ts) is tested against the same
// table, so the two definitions of "transfer" can't drift apart.
describe('transfer definition', () => {
  const cases = require('./fixtures/transfer-cases.json')

  beforeAll(async () => {
    await db.addItem('user_t', 'item_t', 'tok')
    await db.upsertAccount('item_t', baseAccount({ account_id: 'acc_t' }))
    for (const [i, c] of cases.entries()) {
      await db.upsertTransaction(
        baseTxn({
          account_id: 'acc_t',
          transaction_id: `t_${i}`,
          personal_finance_category: c.pfc ? { primary: c.pfc } : null,
        }),
      )
      if (c.override) await db.setTransactionOverride('user_t', `t_${i}`, { category: c.override })
    }
  })

  test('excludeTransfers keeps exactly the non-transfer cases', async () => {
    const rows = await db.getTransactionsForUser('user_t', { excludeTransfers: true, limit: 50 })
    const expected = cases.flatMap((c, i) => (c.transfer ? [] : [`t_${i}`]))
    expect(rows.map((r) => r.transaction_id).sort()).toEqual(expected.sort())
  })
})

describe('withTransaction', () => {
  test('commits on success and returns the result', async () => {
    await expect(db.withTransaction(async (client) => (await client.query('SELECT 1 AS one')).rows[0].one)).resolves.toBe(1)
  })

  test('rolls back and rethrows on failure', async () => {
    await expect(
      db.withTransaction(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })
})
