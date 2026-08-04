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
  test('lists the connected banks without leaking access tokens', async () => {
    db.getItemsForUser.mockResolvedValue([
      { item_id: 'item_1', institution_name: 'First Bank', institution_id: 'ins_1', access_token: 'secret' },
    ])

    const res = await request(app).get('/api/plaid/items')

    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([
      { item_id: 'item_1', institution_name: 'First Bank', institution_id: 'ins_1' },
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

  test('keeps our rows when Plaid refuses the removal', async () => {
    db.getItemsForUser.mockResolvedValue([{ item_id: 'item_1', access_token: 'tok_1' }])
    plaidClient.itemRemove.mockRejectedValue(new Error('plaid down'))

    const res = await request(app).delete('/api/plaid/items/item_1')

    expect(res.status).toBe(500)
    expect(db.deleteItem).not.toHaveBeenCalled()
  })
})
