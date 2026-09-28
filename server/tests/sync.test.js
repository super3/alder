jest.mock('../src/db')
jest.mock('../src/plaid', () => ({ plaidClient: { transactionsSync: jest.fn() } }))

const db = require('../src/db')
const { plaidClient } = require('../src/plaid')
const { syncTransactions } = require('../src/sync')

const page = (data) => ({ data })
const mutationError = () => {
  const err = new Error('mutation')
  err.response = { data: { error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' } }
  return err
}

beforeEach(() => {
  jest.clearAllMocks()
  db.getItemByItemId.mockResolvedValue({
    item_id: 'item_1',
    access_token: 'access-token',
    transaction_cursor: null,
  })
})

test('throws for an unknown item', async () => {
  db.getItemByItemId.mockResolvedValue(undefined)
  await expect(syncTransactions('missing')).rejects.toThrow('Unknown item: missing')
})

test('paginates with cursors and applies added/modified/removed', async () => {
  plaidClient.transactionsSync
    .mockResolvedValueOnce(
      page({
        added: [{ transaction_id: 'a1' }],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: true,
      }),
    )
    .mockResolvedValueOnce(
      page({
        added: [{ transaction_id: 'a2' }],
        modified: [{ transaction_id: 'm1' }],
        removed: [{ transaction_id: 'r1' }],
        next_cursor: 'c2',
        has_more: false,
      }),
    )

  const result = await syncTransactions('item_1')

  expect(plaidClient.transactionsSync).toHaveBeenNthCalledWith(1, {
    access_token: 'access-token',
    cursor: undefined,
  })
  expect(plaidClient.transactionsSync).toHaveBeenNthCalledWith(2, {
    access_token: 'access-token',
    cursor: 'c1',
  })
  expect(db.upsertTransaction).toHaveBeenCalledTimes(3)
  expect(db.markTransactionRemoved).toHaveBeenCalledWith('r1')
  expect(db.saveCursor).toHaveBeenCalledWith('item_1', 'c2')
  // A completed pass is what proves the connection healthy.
  expect(db.markItemSynced).toHaveBeenCalledWith('item_1')
  expect(result).toEqual({ added: 2, modified: 1, removed: 1 })
})

test('resumes from a stored cursor', async () => {
  db.getItemByItemId.mockResolvedValue({
    item_id: 'item_1',
    access_token: 'access-token',
    transaction_cursor: 'stored',
  })
  plaidClient.transactionsSync.mockResolvedValue(
    page({ added: [], modified: [], removed: [], next_cursor: 'stored2', has_more: false }),
  )

  await syncTransactions('item_1')
  expect(plaidClient.transactionsSync).toHaveBeenCalledWith({
    access_token: 'access-token',
    cursor: 'stored',
  })
})

test('retries on TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION', async () => {
  plaidClient.transactionsSync
    .mockRejectedValueOnce(mutationError())
    .mockResolvedValueOnce(
      page({ added: [], modified: [], removed: [], next_cursor: 'c1', has_more: false }),
    )

  const result = await syncTransactions('item_1')
  expect(result).toEqual({ added: 0, modified: 0, removed: 0 })
  expect(plaidClient.transactionsSync).toHaveBeenCalledTimes(2)
})

test('gives up after maxRetries mutation errors', async () => {
  plaidClient.transactionsSync.mockRejectedValue(mutationError())
  await expect(syncTransactions('item_1', { maxRetries: 2 })).rejects.toThrow('mutation')
  expect(plaidClient.transactionsSync).toHaveBeenCalledTimes(2)
})

test('rethrows non-retryable errors immediately', async () => {
  plaidClient.transactionsSync.mockRejectedValue(new Error('boom'))
  await expect(syncTransactions('item_1')).rejects.toThrow('boom')
  expect(plaidClient.transactionsSync).toHaveBeenCalledTimes(1)
  expect(db.saveCursor).not.toHaveBeenCalled()
})

test('records a Plaid failure against the item before rethrowing', async () => {
  const err = Object.assign(new Error('login'), { response: { data: { error_code: 'ITEM_LOGIN_REQUIRED' } } })
  plaidClient.transactionsSync.mockRejectedValue(err)

  await expect(syncTransactions('item_1')).rejects.toBe(err)

  expect(db.setItemStatus).toHaveBeenCalledWith('item_1', 'login_required', 'ITEM_LOGIN_REQUIRED')
  expect(db.markItemSynced).not.toHaveBeenCalled()
})
