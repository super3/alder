jest.mock('../src/db')
jest.mock('../src/sync', () => ({ syncTransactions: jest.fn() }))

const request = require('supertest')
const db = require('../src/db')
const { syncTransactions } = require('../src/sync')
const transactionsRouter = require('../src/routes/transactions')
const { makeApp } = require('./helpers/app')

const app = makeApp(transactionsRouter)
const plaidError = (code) => Object.assign(new Error(code), { response: { data: { error_code: code } } })

beforeEach(() => jest.clearAllMocks())

describe('POST /api/plaid/sync', () => {
  test('syncs every item for the user', async () => {
    db.getItemsForUser.mockResolvedValue([{ item_id: 'item_1' }, { item_id: 'item_2' }])
    syncTransactions
      .mockResolvedValueOnce({ added: 3, modified: 1, removed: 0 })
      .mockResolvedValueOnce({ added: 0, modified: 0, removed: 2 })

    const res = await request(app).post('/api/plaid/sync')
    expect(res.status).toBe(200)
    expect(res.body.results).toEqual([
      { item_id: 'item_1', ok: true, added: 3, modified: 1, removed: 0 },
      { item_id: 'item_2', ok: true, added: 0, modified: 0, removed: 2 },
    ])
  })

  // Regression: one bank needing re-login used to fail the refresh for all.
  test('a Plaid failure on one item is reported without failing the others', async () => {
    db.getItemsForUser.mockResolvedValue([{ item_id: 'broken' }, { item_id: 'fine' }])
    syncTransactions
      .mockRejectedValueOnce(plaidError('ITEM_LOGIN_REQUIRED'))
      .mockResolvedValueOnce({ added: 1, modified: 0, removed: 0 })

    const res = await request(app).post('/api/plaid/sync')

    expect(res.status).toBe(200)
    expect(res.body.results).toEqual([
      { item_id: 'broken', ok: false, error_code: 'ITEM_LOGIN_REQUIRED' },
      { item_id: 'fine', ok: true, added: 1, modified: 0, removed: 0 },
    ])
  })

  test('failures that did not come from Plaid are still a 500', async () => {
    db.getItemsForUser.mockResolvedValue([{ item_id: 'item_1' }])
    syncTransactions.mockRejectedValue(new Error('cursor trouble'))
    const res = await request(app).post('/api/plaid/sync')
    expect(res.status).toBe(500)
  })
})

describe('GET /api/plaid/transactions', () => {
  const noFilters = {
    start: undefined,
    end: undefined,
    accountId: undefined,
    pendingOnly: false,
    incomeOnly: false,
    excludeTransfers: false,
  }

  beforeEach(() => {
    db.getTransactionsForUser.mockResolvedValue([{ transaction_id: 'txn_1' }])
    db.countTransactionsForUser.mockResolvedValue(812)
  })

  test('returns a page plus the total, so a page is never mistaken for everything', async () => {
    const res = await request(app).get('/api/plaid/transactions')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ transactions: [{ transaction_id: 'txn_1' }], total: 812 })
    expect(db.getTransactionsForUser).toHaveBeenCalledWith('user_1', { ...noFilters, limit: 100, offset: 0 })
    expect(db.countTransactionsForUser).toHaveBeenCalledWith('user_1', noFilters)
  })

  test('passes range, account and flag filters to both the page and the count', async () => {
    await request(app).get(
      '/api/plaid/transactions?start=2026-01-01&end=2026-03-31&account_id=acc_1&pending=1&income=true&exclude_transfers=1&limit=50&offset=100',
    )
    const filters = {
      start: '2026-01-01',
      end: '2026-03-31',
      accountId: 'acc_1',
      pendingOnly: true,
      incomeOnly: true,
      excludeTransfers: true,
    }
    expect(db.getTransactionsForUser).toHaveBeenCalledWith('user_1', { ...filters, limit: 50, offset: 100 })
    expect(db.countTransactionsForUser).toHaveBeenCalledWith('user_1', filters)
  })

  test.each([
    ['9999', 500],
    ['abc', 100],
    ['-5', 1],
  ])('clamps limit=%s to %d', async (limit, expected) => {
    await request(app).get(`/api/plaid/transactions?limit=${limit}`)
    expect(db.getTransactionsForUser).toHaveBeenCalledWith('user_1', expect.objectContaining({ limit: expected }))
  })

  test('treats a negative offset as zero', async () => {
    await request(app).get('/api/plaid/transactions?offset=-10')
    expect(db.getTransactionsForUser).toHaveBeenCalledWith('user_1', expect.objectContaining({ offset: 0 }))
  })

  test.each(['start=2026-1-1', 'end=yesterday'])('rejects a malformed date (%s)', async (query) => {
    const res = await request(app).get(`/api/plaid/transactions?${query}`)
    expect(res.status).toBe(400)
    expect(db.getTransactionsForUser).not.toHaveBeenCalled()
  })

  test('surfaces database failures as 500', async () => {
    db.getTransactionsForUser.mockRejectedValue(new Error('db down'))
    const res = await request(app).get('/api/plaid/transactions')
    expect(res.status).toBe(500)
  })
})

describe('GET /api/plaid/transactions/daily', () => {
  test('defaults to roughly the last year', async () => {
    db.getDailyTotals.mockResolvedValue([{ date: '2026-09-01', net: -12.5, income: 0, spending: 12.5 }])

    const res = await request(app).get('/api/plaid/transactions/daily')

    expect(res.status).toBe(200)
    expect(res.body.days).toHaveLength(1)
    const [, start] = db.getDailyTotals.mock.calls[0]
    const daysBack = (Date.now() - Date.parse(start)) / 86_400_000
    expect(daysBack).toBeGreaterThan(365)
    expect(daysBack).toBeLessThan(368)
  })

  test('honors an explicit start', async () => {
    db.getDailyTotals.mockResolvedValue([])
    await request(app).get('/api/plaid/transactions/daily?start=2025-01-01')
    expect(db.getDailyTotals).toHaveBeenCalledWith('user_1', '2025-01-01')
  })

  test('rejects a malformed start', async () => {
    const res = await request(app).get('/api/plaid/transactions/daily?start=last-year')
    expect(res.status).toBe(400)
    expect(db.getDailyTotals).not.toHaveBeenCalled()
  })

  test('surfaces database failures as 500', async () => {
    db.getDailyTotals.mockRejectedValue(new Error('db down'))
    const res = await request(app).get('/api/plaid/transactions/daily')
    expect(res.status).toBe(500)
  })
})

describe('PUT /api/plaid/transactions/:id/override', () => {
  const put = (body) => request(app).put('/api/plaid/transactions/txn_1/override').send(body)

  beforeEach(() => db.ownsTransaction.mockResolvedValue(true))

  // Regression: a single-field edit used to be written as a two-field upsert,
  // nulling whichever field the request left out.
  test('a single-field edit only names that field', async () => {
    const res = await put({ category: 'Groceries' })
    expect(res.status).toBe(200)
    expect(db.setTransactionOverride).toHaveBeenCalledWith('user_1', 'txn_1', { category: 'Groceries' })
  })

  test('saves both fields, trimmed', async () => {
    await put({ merchant_name: '  Corner Store ', category: 'Groceries' })
    expect(db.setTransactionOverride).toHaveBeenCalledWith('user_1', 'txn_1', {
      merchantName: 'Corner Store',
      category: 'Groceries',
    })
  })

  test('null resets just that field', async () => {
    await put({ merchant_name: null })
    expect(db.setTransactionOverride).toHaveBeenCalledWith('user_1', 'txn_1', { merchantName: null })
  })

  test.each([
    [{}, 'an empty body'],
    [{ merchant_name: '   ' }, 'a blank name'],
    [{ category: 42 }, 'a non-string'],
    [{ merchant_name: 'x'.repeat(121) }, 'an overlong name'],
  ])('rejects %j (%s)', async (body) => {
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(db.setTransactionOverride).not.toHaveBeenCalled()
  })

  test('rejects a request with no body at all', async () => {
    const res = await request(app).put('/api/plaid/transactions/txn_1/override')
    expect(res.status).toBe(400)
  })

  test("refuses to override someone else's transaction", async () => {
    db.ownsTransaction.mockResolvedValue(false)
    const res = await put({ merchant_name: 'Nice try' })
    expect(res.status).toBe(404)
    expect(db.setTransactionOverride).not.toHaveBeenCalled()
  })

  test('surfaces save failures as 500', async () => {
    db.setTransactionOverride.mockRejectedValue(new Error('db down'))
    const res = await put({ category: 'x' })
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/plaid/transactions/:id/override', () => {
  test('clears every edit on the transaction', async () => {
    db.ownsTransaction.mockResolvedValue(true)
    const res = await request(app).delete('/api/plaid/transactions/txn_1/override')
    expect(res.status).toBe(200)
    expect(db.clearTransactionOverride).toHaveBeenCalledWith('user_1', 'txn_1')
  })

  test("refuses to clear someone else's override", async () => {
    db.ownsTransaction.mockResolvedValue(false)
    const res = await request(app).delete('/api/plaid/transactions/not_mine/override')
    expect(res.status).toBe(404)
    expect(db.clearTransactionOverride).not.toHaveBeenCalled()
  })

  test('surfaces clear failures as 500', async () => {
    db.ownsTransaction.mockResolvedValue(true)
    db.clearTransactionOverride.mockRejectedValue(new Error('db down'))
    const res = await request(app).delete('/api/plaid/transactions/txn_1/override')
    expect(res.status).toBe(500)
  })
})
