jest.mock('../src/db')
jest.mock('../src/sync', () => ({ syncTransactions: jest.fn() }))
jest.mock('../src/plaid', () => ({
  plaidClient: {
    linkTokenCreate: jest.fn(),
    itemPublicTokenExchange: jest.fn(),
    itemGet: jest.fn(),
    institutionsGetById: jest.fn(),
    accountsGet: jest.fn(),
  },
}))

const request = require('supertest')
const db = require('../src/db')
const { plaidClient } = require('../src/plaid')
const { syncTransactions } = require('../src/sync')
const tokensRouter = require('../src/routes/tokens')
const { makeApp } = require('./helpers/app')

const flush = () => new Promise(setImmediate)
const app = makeApp(tokensRouter)

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  delete process.env.PLAID_WEBHOOK_URL
  syncTransactions.mockResolvedValue({ added: 0, modified: 0, removed: 0 })
})

afterEach(() => {
  console.error.mockRestore()
})

describe('POST /api/plaid/link-token', () => {
  test('creates a link token without a webhook by default', async () => {
    plaidClient.linkTokenCreate.mockResolvedValue({ data: { link_token: 'link-token-1' } })

    const res = await request(app).post('/api/plaid/link-token')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ link_token: 'link-token-1' })
    expect(plaidClient.linkTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { client_user_id: 'user_1' },
        products: ['transactions'],
        transactions: { days_requested: 730 },
        webhook: undefined,
      }),
    )
  })

  test('with an item_id, opens Link in update mode for that item', async () => {
    db.getItemsForUser.mockResolvedValue([{ item_id: 'item_1', access_token: 'tok_1' }])
    plaidClient.linkTokenCreate.mockResolvedValue({ data: { link_token: 'update-token' } })

    const res = await request(app).post('/api/plaid/link-token').send({ item_id: 'item_1' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ link_token: 'update-token' })
    const [call] = plaidClient.linkTokenCreate.mock.calls[0]
    expect(call.access_token).toBe('tok_1')
    // Update mode re-authenticates; it must not request products afresh.
    expect(call.products).toBeUndefined()
  })

  test("refuses update mode for an item that isn't the caller's", async () => {
    db.getItemsForUser.mockResolvedValue([{ item_id: 'mine', access_token: 'tok' }])

    const res = await request(app).post('/api/plaid/link-token').send({ item_id: 'theirs' })

    expect(res.status).toBe(404)
    expect(plaidClient.linkTokenCreate).not.toHaveBeenCalled()
  })

  test('passes PLAID_WEBHOOK_URL when configured', async () => {
    process.env.PLAID_WEBHOOK_URL = 'https://api.example.com/api/plaid/webhook'
    plaidClient.linkTokenCreate.mockResolvedValue({ data: { link_token: 'link-token-2' } })

    await request(app).post('/api/plaid/link-token')
    expect(plaidClient.linkTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({ webhook: 'https://api.example.com/api/plaid/webhook' }),
    )
  })

  test('surfaces Plaid failures as 500', async () => {
    plaidClient.linkTokenCreate.mockRejectedValue(new Error('plaid down'))
    const res = await request(app).post('/api/plaid/link-token')
    expect(res.status).toBe(500)
  })
})

describe('POST /api/plaid/exchange', () => {
  const exchangeMocks = () => {
    plaidClient.itemPublicTokenExchange.mockResolvedValue({
      data: { access_token: 'access-token', item_id: 'item_1' },
    })
    plaidClient.itemGet.mockResolvedValue({ data: { item: { institution_id: 'ins_109508' } } })
    plaidClient.institutionsGetById.mockResolvedValue({
      data: { institution: { name: 'First Platypus Bank' } },
    })
    plaidClient.accountsGet.mockResolvedValue({
      data: { accounts: [{ account_id: 'acc_1' }, { account_id: 'acc_2' }] },
    })
  }

  test('requires public_token', async () => {
    const res = await request(app).post('/api/plaid/exchange').send({})
    expect(res.status).toBe(400)
  })

  test('exchanges, enriches, stores accounts, and kicks off a sync', async () => {
    exchangeMocks()

    const res = await request(app).post('/api/plaid/exchange').send({ public_token: 'public-token' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ item_id: 'item_1', institution_name: 'First Platypus Bank', accounts: 2 })
    expect(db.addItem).toHaveBeenCalledWith('user_1', 'item_1', 'access-token')
    expect(db.setInstitution).toHaveBeenCalledWith('item_1', 'ins_109508', 'First Platypus Bank')
    expect(db.upsertAccount).toHaveBeenCalledTimes(2)
    expect(syncTransactions).toHaveBeenCalledWith('item_1')
  })

  test('skips institution enrichment when the item has none', async () => {
    exchangeMocks()
    plaidClient.itemGet.mockResolvedValue({ data: { item: { institution_id: null } } })

    const res = await request(app).post('/api/plaid/exchange').send({ public_token: 'public-token' })
    expect(res.status).toBe(200)
    expect(res.body.institution_name).toBeNull()
    expect(db.setInstitution).not.toHaveBeenCalled()
  })

  test('continues when institution enrichment fails', async () => {
    exchangeMocks()
    plaidClient.itemGet.mockRejectedValue(new Error('no item info'))

    const res = await request(app).post('/api/plaid/exchange').send({ public_token: 'public-token' })
    expect(res.status).toBe(200)
    expect(res.body.institution_name).toBeNull()
    expect(console.error).toHaveBeenCalledWith('Institution enrichment failed:', 'no item info')
  })

  test('logs the Plaid error payload when enrichment fails with one', async () => {
    exchangeMocks()
    const err = new Error('rate limited')
    err.response = { data: { error_code: 'RATE_LIMIT' } }
    plaidClient.institutionsGetById.mockRejectedValue(err)

    const res = await request(app).post('/api/plaid/exchange').send({ public_token: 'public-token' })
    expect(res.status).toBe(200)
    expect(console.error).toHaveBeenCalledWith('Institution enrichment failed:', { error_code: 'RATE_LIMIT' })
  })

  test('logs but does not fail when the initial sync errors', async () => {
    exchangeMocks()
    const err = new Error('sync failed')
    err.response = { data: { error_code: 'X' } }
    syncTransactions.mockRejectedValue(err)

    const res = await request(app).post('/api/plaid/exchange').send({ public_token: 'public-token' })
    expect(res.status).toBe(200)
    await flush()
    expect(console.error).toHaveBeenCalledWith('Initial sync failed:', { error_code: 'X' })
  })

  test('logs the plain message when the initial sync errors without a payload', async () => {
    exchangeMocks()
    syncTransactions.mockRejectedValue(new Error('network blip'))

    const res = await request(app).post('/api/plaid/exchange').send({ public_token: 'public-token' })
    expect(res.status).toBe(200)
    await flush()
    expect(console.error).toHaveBeenCalledWith('Initial sync failed:', 'network blip')
  })

  test('surfaces exchange failures as 500', async () => {
    plaidClient.itemPublicTokenExchange.mockRejectedValue(new Error('bad token'))
    const res = await request(app).post('/api/plaid/exchange').send({ public_token: 'nope' })
    expect(res.status).toBe(500)
  })
})
