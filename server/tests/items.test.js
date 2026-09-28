jest.mock('../src/db')
jest.mock('../src/plaid', () => ({ plaidClient: { itemRemove: jest.fn() } }))

const request = require('supertest')
const db = require('../src/db')
const { plaidClient } = require('../src/plaid')
const itemsRouter = require('../src/routes/items')
const { makeApp } = require('./helpers/app')

const app = makeApp(itemsRouter)

beforeEach(() => jest.clearAllMocks())

describe('GET /api/plaid/items', () => {
  test('lists connected banks with their health, without leaking access tokens', async () => {
    db.getItemsForUser.mockResolvedValue([
      {
        item_id: 'item_1',
        institution_name: 'First Bank',
        institution_id: 'ins_1',
        access_token: 'secret',
        status: 'ok',
        error_code: null,
        last_synced_at: new Date('2026-09-27T08:00:00Z'),
      },
      {
        item_id: 'item_2',
        institution_name: 'Second Bank',
        institution_id: 'ins_2',
        access_token: 'secret-2',
        status: 'login_required',
        error_code: 'ITEM_LOGIN_REQUIRED',
        last_synced_at: null,
      },
    ])

    const res = await request(app).get('/api/plaid/items')

    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([
      {
        item_id: 'item_1',
        institution_name: 'First Bank',
        institution_id: 'ins_1',
        status: 'ok',
        error_code: null,
        last_synced_at: '2026-09-27T08:00:00.000Z',
      },
      {
        item_id: 'item_2',
        institution_name: 'Second Bank',
        institution_id: 'ins_2',
        status: 'login_required',
        error_code: 'ITEM_LOGIN_REQUIRED',
        last_synced_at: null,
      },
    ])
    expect(JSON.stringify(res.body)).not.toContain('secret')
  })

  test('surfaces failures as 500', async () => {
    db.getItemsForUser.mockRejectedValue(new Error('db down'))
    const res = await request(app).get('/api/plaid/items')
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/plaid/items/:itemId', () => {
  test('tells Plaid to remove the item, then drops our rows', async () => {
    db.getItemsForUser.mockResolvedValue([{ item_id: 'item_1', access_token: 'tok_1' }])
    plaidClient.itemRemove.mockResolvedValue({ data: {} })

    const res = await request(app).delete('/api/plaid/items/item_1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ removed: 'item_1' })
    // The Plaid call is the part that stops the monthly per-Item billing.
    expect(plaidClient.itemRemove).toHaveBeenCalledWith({ access_token: 'tok_1' })
    expect(db.deleteItem).toHaveBeenCalledWith('user_1', 'item_1')
  })

  test("refuses an item that isn't the caller's and never calls Plaid", async () => {
    db.getItemsForUser.mockResolvedValue([{ item_id: 'mine', access_token: 'tok' }])

    const res = await request(app).delete('/api/plaid/items/someone_elses')

    expect(res.status).toBe(404)
    expect(plaidClient.itemRemove).not.toHaveBeenCalled()
    expect(db.deleteItem).not.toHaveBeenCalled()
  })

  // Regression: if our delete failed after Plaid removed the item, every retry
  // got an error from Plaid and the bank could never be removed.
  test.each(['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN'])(
    'finishes a retried disconnect when Plaid already forgot the item (%s)',
    async (code) => {
      db.getItemsForUser.mockResolvedValue([{ item_id: 'item_1', access_token: 'tok_1' }])
      plaidClient.itemRemove.mockRejectedValue(
        Object.assign(new Error(code), { response: { data: { error_code: code } } }),
      )

      const res = await request(app).delete('/api/plaid/items/item_1')

      expect(res.status).toBe(200)
      expect(db.deleteItem).toHaveBeenCalledWith('user_1', 'item_1')
    },
  )

  test('keeps our rows when Plaid refuses the removal', async () => {
    db.getItemsForUser.mockResolvedValue([{ item_id: 'item_1', access_token: 'tok_1' }])
    plaidClient.itemRemove.mockRejectedValue(new Error('plaid down'))

    const res = await request(app).delete('/api/plaid/items/item_1')

    expect(res.status).toBe(500)
    expect(db.deleteItem).not.toHaveBeenCalled()
  })
})
