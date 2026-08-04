jest.mock('../src/db')
jest.mock('../src/sync', () => ({ syncTransactions: jest.fn() }))

const request = require('supertest')
const db = require('../src/db')
const { syncTransactions } = require('../src/sync')
const transactionsRouter = require('../src/routes/transactions')
const { makeApp } = require('./helpers/app')

const app = makeApp(transactionsRouter)

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
      { item_id: 'item_1', added: 3, modified: 1, removed: 0 },
      { item_id: 'item_2', added: 0, modified: 0, removed: 2 },
    ])
  })

  test('surfaces sync failures as 500', async () => {
    db.getItemsForUser.mockResolvedValue([{ item_id: 'item_1' }])
    syncTransactions.mockRejectedValue(new Error('cursor trouble'))
    const res = await request(app).post('/api/plaid/sync')
    expect(res.status).toBe(500)
  })
})

describe('GET /api/plaid/transactions', () => {
  test('defaults the limit to 100', async () => {
    db.getTransactionsForUser.mockResolvedValue([{ transaction_id: 'txn_1' }])
    const res = await request(app).get('/api/plaid/transactions')
    expect(res.status).toBe(200)
    expect(res.body.transactions).toHaveLength(1)
    expect(db.getTransactionsForUser).toHaveBeenCalledWith('user_1', 100)
  })

  test('honors an explicit limit', async () => {
    db.getTransactionsForUser.mockResolvedValue([])
    await request(app).get('/api/plaid/transactions?limit=5')
    expect(db.getTransactionsForUser).toHaveBeenCalledWith('user_1', 5)
  })

  test('caps the limit at 500', async () => {
    db.getTransactionsForUser.mockResolvedValue([])
    await request(app).get('/api/plaid/transactions?limit=9999')
    expect(db.getTransactionsForUser).toHaveBeenCalledWith('user_1', 500)
  })

  test('falls back to 100 for a non-numeric limit', async () => {
    db.getTransactionsForUser.mockResolvedValue([])
    await request(app).get('/api/plaid/transactions?limit=abc')
    expect(db.getTransactionsForUser).toHaveBeenCalledWith('user_1', 100)
  })

  test('surfaces database failures as 500', async () => {
    db.getTransactionsForUser.mockRejectedValue(new Error('db down'))
    const res = await request(app).get('/api/plaid/transactions')
    expect(res.status).toBe(500)
  })
})

describe('transaction overrides', () => {
  test('saves a merchant and category edit', async () => {
    db.ownsTransaction.mockResolvedValue(true)

    const res = await request(app)
      .put('/api/plaid/transactions/txn_1/override')
      .send({ merchant_name: 'Corner Store', category: 'Groceries' })

    expect(res.status).toBe(200)
    expect(db.setTransactionOverride).toHaveBeenCalledWith('user_1', 'txn_1', {
      merchantName: 'Corner Store',
      category: 'Groceries',
    })
  })

  test('tolerates an empty body', async () => {
    db.ownsTransaction.mockResolvedValue(true)
    const res = await request(app).put('/api/plaid/transactions/txn_1/override')
    expect(res.status).toBe(200)
    expect(db.setTransactionOverride).toHaveBeenCalledWith('user_1', 'txn_1', {
      merchantName: undefined,
      category: undefined,
    })
  })

  test("refuses to override someone else's transaction", async () => {
    db.ownsTransaction.mockResolvedValue(false)

    const res = await request(app)
      .put('/api/plaid/transactions/not_mine/override')
      .send({ merchant_name: 'Nice try' })

    expect(res.status).toBe(404)
    expect(db.setTransactionOverride).not.toHaveBeenCalled()
  })

  test('surfaces save failures as 500', async () => {
    db.ownsTransaction.mockResolvedValue(true)
    db.setTransactionOverride.mockRejectedValue(new Error('db down'))
    const res = await request(app).put('/api/plaid/transactions/txn_1/override').send({ category: 'x' })
    expect(res.status).toBe(500)
  })

  test('clears an override', async () => {
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
