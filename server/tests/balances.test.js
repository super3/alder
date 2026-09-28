jest.mock('../src/db')
jest.mock('../src/plaid', () => ({ plaidClient: { accountsBalanceGet: jest.fn() } }))

const request = require('supertest')
const db = require('../src/db')
const { plaidClient } = require('../src/plaid')
const balancesRouter = require('../src/routes/balances')
const { makeApp } = require('./helpers/app')

const app = makeApp(balancesRouter)

beforeEach(() => jest.clearAllMocks())

test('returns normalized balances across all items', async () => {
  db.getItemsForUser.mockResolvedValue([
    { item_id: 'item_1', access_token: 'token-1', status: 'ok', institution_name: 'First Platypus Bank' },
    { item_id: 'item_2', access_token: 'token-2', status: 'ok', institution_name: 'Tattersall Federal' },
  ])
  plaidClient.accountsBalanceGet
    .mockResolvedValueOnce({
      data: {
        accounts: [
          {
            account_id: 'acc_1',
            name: 'Checking',
            official_name: 'Plaid Checking',
            mask: '0000',
            type: 'depository',
            subtype: 'checking',
            balances: { available: 100, current: 110, iso_currency_code: 'USD' },
          },
        ],
      },
    })
    .mockResolvedValueOnce({
      data: {
        accounts: [
          {
            account_id: 'acc_2',
            name: 'Credit Card',
            official_name: null,
            mask: '3333',
            type: 'credit',
            subtype: 'credit card',
            balances: { available: null, current: 410, iso_currency_code: 'USD' },
          },
        ],
      },
    })

  const res = await request(app).get('/api/plaid/balances')
  expect(res.status).toBe(200)
  expect(res.body.accounts).toHaveLength(2)
  expect(res.body.accounts[0]).toEqual({
    account_id: 'acc_1',
    item_id: 'item_1',
    name: 'Checking',
    official_name: 'Plaid Checking',
    mask: '0000',
    type: 'depository',
    subtype: 'checking',
    balances: { available: 100, current: 110, iso_currency_code: 'USD' },
    institution_name: 'First Platypus Bank',
    balances_updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    stale: false,
  })
  expect(res.body.accounts[1].institution_name).toBe('Tattersall Federal')
  expect(db.upsertAccount).toHaveBeenCalledTimes(2)
  // Healthy items aren't rewritten on every read.
  expect(db.setItemStatus).not.toHaveBeenCalled()
})

test('clears a stale error once the item answers again', async () => {
  db.getItemsForUser.mockResolvedValue([
    { item_id: 'item_1', access_token: 'token-1', status: 'login_required', institution_name: 'Bank' },
  ])
  plaidClient.accountsBalanceGet.mockResolvedValue({ data: { accounts: [] } })

  await request(app).get('/api/plaid/balances')

  expect(db.setItemStatus).toHaveBeenCalledWith('item_1', 'ok', null)
})

test('returns an empty list when the user has no items', async () => {
  db.getItemsForUser.mockResolvedValue([])
  const res = await request(app).get('/api/plaid/balances')
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ accounts: [] })
  expect(plaidClient.accountsBalanceGet).not.toHaveBeenCalled()
})

const plaidError = (code) => Object.assign(new Error(code), { response: { data: { error_code: code } } })

// Regression: one bank needing re-login used to 500 the whole request, which
// blanked every screen in the app.
test('one broken bank serves its last-known balances instead of failing the rest', async () => {
  db.getItemsForUser.mockResolvedValue([
    { item_id: 'item_ok', access_token: 'token-ok', status: 'ok', institution_name: 'Working Bank' },
    { item_id: 'item_bad', access_token: 'token-bad', status: 'ok', institution_name: 'Broken Bank' },
  ])
  plaidClient.accountsBalanceGet
    .mockResolvedValueOnce({
      data: {
        accounts: [
          {
            account_id: 'acc_ok',
            name: 'Checking',
            official_name: null,
            mask: '1',
            type: 'depository',
            subtype: 'checking',
            balances: { available: 5, current: 5, iso_currency_code: 'USD' },
          },
        ],
      },
    })
    .mockRejectedValueOnce(plaidError('ITEM_LOGIN_REQUIRED'))
  db.getAccountsForItem.mockResolvedValue([
    {
      account_id: 'acc_bad',
      name: 'Savings',
      official_name: null,
      mask: '2',
      type: 'depository',
      subtype: 'savings',
      // pg returns NUMERIC as strings.
      current_balance: '1234.50',
      available_balance: null,
      iso_currency_code: 'USD',
      balances_updated_at: new Date('2026-09-01T12:00:00Z'),
    },
    {
      account_id: 'acc_never',
      name: 'Never refreshed',
      official_name: null,
      mask: '3',
      type: 'depository',
      subtype: 'savings',
      current_balance: null,
      available_balance: '9',
      iso_currency_code: 'USD',
      balances_updated_at: null,
    },
  ])

  const res = await request(app).get('/api/plaid/balances')

  expect(res.status).toBe(200)
  expect(res.body.accounts.map((a) => [a.account_id, a.stale])).toEqual([
    ['acc_ok', false],
    ['acc_bad', true],
    ['acc_never', true],
  ])
  expect(res.body.accounts[1]).toMatchObject({
    item_id: 'item_bad',
    balances: { current: 1234.5, available: null, iso_currency_code: 'USD' },
    balances_updated_at: '2026-09-01T12:00:00.000Z',
    institution_name: 'Broken Bank',
  })
  expect(res.body.accounts[2]).toMatchObject({ balances: { current: null, available: 9 }, balances_updated_at: null })
  expect(db.setItemStatus).toHaveBeenCalledWith('item_bad', 'login_required', 'ITEM_LOGIN_REQUIRED')
})

test('failures that did not come from Plaid are still a 500', async () => {
  db.getItemsForUser.mockResolvedValue([{ item_id: 'item_1', access_token: 'token-1', status: 'ok' }])
  plaidClient.accountsBalanceGet.mockResolvedValue({
    data: { accounts: [{ account_id: 'a', balances: {} }] },
  })
  db.upsertAccount.mockRejectedValue(new Error('db down'))
  const res = await request(app).get('/api/plaid/balances')
  expect(res.status).toBe(500)
})
