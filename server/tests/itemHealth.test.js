jest.mock('../src/db')

const db = require('../src/db')
const { plaidErrorCode, statusForCode, recordItemError, applyItemWebhook } = require('../src/itemHealth')

const plaidError = (code) => Object.assign(new Error(code), { response: { data: { error_code: code } } })

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => console.error.mockRestore())

describe('plaidErrorCode / statusForCode', () => {
  test('reads the code off a Plaid API error, and nothing off anything else', () => {
    expect(plaidErrorCode(plaidError('ITEM_LOGIN_REQUIRED'))).toBe('ITEM_LOGIN_REQUIRED')
    expect(plaidErrorCode(new Error('ECONNRESET'))).toBeNull()
    expect(plaidErrorCode(undefined)).toBeNull()
  })

  test('codes that need the user to sign in again map to login_required', () => {
    expect(statusForCode('ITEM_LOGIN_REQUIRED')).toBe('login_required')
    expect(statusForCode('PENDING_EXPIRATION')).toBe('login_required')
    expect(statusForCode('INSTITUTION_DOWN')).toBe('error')
    expect(statusForCode(null)).toBe('error')
  })
})

describe('recordItemError', () => {
  test('records a Plaid-reported failure', async () => {
    expect(await recordItemError('item_1', plaidError('ITEM_LOGIN_REQUIRED'))).toBe('ITEM_LOGIN_REQUIRED')
    expect(db.setItemStatus).toHaveBeenCalledWith('item_1', 'login_required', 'ITEM_LOGIN_REQUIRED')
  })

  test("leaves the status alone for failures that aren't about the bank", async () => {
    expect(await recordItemError('item_1', new Error('db hiccup'))).toBeNull()
    expect(db.setItemStatus).not.toHaveBeenCalled()
  })

  test('never throws, even if recording itself fails', async () => {
    db.setItemStatus.mockRejectedValueOnce(new Error('db down'))
    await expect(recordItemError('item_1', plaidError('INSTITUTION_DOWN'))).resolves.toBe('INSTITUTION_DOWN')
    expect(console.error).toHaveBeenCalledWith('Recording item status failed:', 'db down')
  })
})

describe('applyItemWebhook', () => {
  test('ERROR records the reported code', async () => {
    await applyItemWebhook('item_1', 'ERROR', { error: { error_code: 'ITEM_LOGIN_REQUIRED' } })
    expect(db.setItemStatus).toHaveBeenCalledWith('item_1', 'login_required', 'ITEM_LOGIN_REQUIRED')
  })

  test('ERROR without a code is still recorded as an error', async () => {
    await applyItemWebhook('item_1', 'ERROR', {})
    expect(db.setItemStatus).toHaveBeenCalledWith('item_1', 'error', null)
  })

  test.each(['PENDING_EXPIRATION', 'PENDING_DISCONNECT', 'USER_PERMISSION_REVOKED'])(
    '%s means the user needs to sign in again',
    async (code) => {
      await applyItemWebhook('item_1', code, {})
      expect(db.setItemStatus).toHaveBeenCalledWith('item_1', 'login_required', code)
    },
  )

  test('LOGIN_REPAIRED clears the status', async () => {
    await applyItemWebhook('item_1', 'LOGIN_REPAIRED', {})
    expect(db.setItemStatus).toHaveBeenCalledWith('item_1', 'ok', null)
  })

  test('other ITEM codes are ignored', async () => {
    await applyItemWebhook('item_1', 'NEW_ACCOUNTS_AVAILABLE', {})
    expect(db.setItemStatus).not.toHaveBeenCalled()
  })
})
