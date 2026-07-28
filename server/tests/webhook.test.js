jest.mock('../src/sync', () => ({ syncTransactions: jest.fn() }))
jest.mock('../src/plaid', () => ({ plaidClient: { webhookVerificationKeyGet: jest.fn() } }))

const request = require('supertest')
const { syncTransactions } = require('../src/sync')
const { plaidClient } = require('../src/plaid')
const { _resetVerifierState } = require('../src/plaidWebhookVerify')
const webhookRouter = require('../src/routes/webhook')
const { makeApp } = require('./helpers/app')
const { jwkFor, publicKey, sign } = require('./helpers/plaidWebhook')

const flush = () => new Promise(setImmediate)
const app = makeApp(webhookRouter, { userId: null })

// Send `payload` as the exact bytes that were signed — supertest's .send()
// would re-serialize and the digest would no longer match.
const post = (payload, options) => {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const req = request(app).post('/api/plaid/webhook').set('Content-Type', 'application/json')
  const token = options?.token === null ? null : options?.token ?? sign(Buffer.from(body))
  if (token) req.set('Plaid-Verification', token)
  return req.send(body)
}

const SYNC_BODY = { webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'item_1' }

let realEnv

beforeEach(() => {
  _resetVerifierState()
  jest.clearAllMocks()
  realEnv = { ...process.env }
  process.env.PLAID_ENV = 'sandbox'
  delete process.env.PLAID_WEBHOOK_VERIFICATION
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
  plaidClient.webhookVerificationKeyGet.mockResolvedValue({ data: { key: jwkFor(publicKey) } })
  syncTransactions.mockResolvedValue({ added: 0, modified: 0, removed: 0 })
})

afterEach(() => {
  process.env = realEnv
  jest.restoreAllMocks()
})

test('an unsigned webhook is rejected and triggers no sync', async () => {
  const res = await post(SYNC_BODY, { token: null })

  expect(res.status).toBe(401)
  expect(res.body).toEqual({ error: 'invalid webhook signature' })
  expect(syncTransactions).not.toHaveBeenCalled()
  expect(console.warn).toHaveBeenCalledWith('plaid.webhook.rejected', expect.stringContaining('missing_header'))
})

test('a webhook whose body was swapped after signing is rejected', async () => {
  const signed = JSON.stringify({ ...SYNC_BODY, item_id: 'mine' })
  const res = await post(JSON.stringify({ ...SYNC_BODY, item_id: 'someone_else' }), {
    token: sign(Buffer.from(signed)),
  })

  expect(res.status).toBe(401)
  expect(syncTransactions).not.toHaveBeenCalled()
  expect(console.warn).toHaveBeenCalledWith('plaid.webhook.rejected', expect.stringContaining('body_hash_mismatch'))
})

test('the rejection log carries the reason and counters but no token or body', async () => {
  const token = sign(Buffer.from(JSON.stringify(SYNC_BODY)), { iat: 0 })
  await post(SYNC_BODY, { token })

  const [, line] = console.warn.mock.calls.find(([tag]) => tag === 'plaid.webhook.rejected')
  const logged = JSON.parse(line)
  expect(logged).toMatchObject({
    reason: 'stale_or_future_iat',
    accepted: expect.any(Number),
    rejected: expect.any(Number),
  })
  expect(line).not.toContain(token)
  expect(line).not.toContain('item_1')
})

// Pins the digest to the bytes on the wire. Plaid pretty-prints its payloads
// and escapes non-ASCII, so a verifier that re-serialized req.body would pass
// every other test here and then reject real webhooks.
test('verifies a body whose exact bytes differ from a re-serialization', async () => {
  const raw = JSON.stringify({ ...SYNC_BODY, merchant: 'Café Ñandú', ratio: 1.0 }, null, 2)
  expect(JSON.stringify(JSON.parse(raw))).not.toBe(raw)

  const res = await post(raw)

  expect(res.status).toBe(200)
  expect(syncTransactions).toHaveBeenCalledWith('item_1')
})

test('a correctly signed SYNC_UPDATES_AVAILABLE triggers a background sync', async () => {
  const res = await post(SYNC_BODY)

  expect(res.status).toBe(200)
  expect(res.body).toEqual({ received: true })
  expect(syncTransactions).toHaveBeenCalledWith('item_1')
  expect(console.log).toHaveBeenCalledWith('plaid.webhook.accepted', expect.stringContaining('SYNC_UPDATES_AVAILABLE'))
})

test('logs but still succeeds when the sync fails', async () => {
  syncTransactions.mockRejectedValue(new Error('sync failed'))

  const res = await post(SYNC_BODY)
  expect(res.status).toBe(200)
  await flush()
  expect(console.error).toHaveBeenCalledWith('Webhook-triggered sync failed:', 'sync failed')
})

test('ignores other webhook types', async () => {
  const res = await post({ webhook_type: 'ITEM', webhook_code: 'ERROR', item_id: 'item_1' })
  expect(res.status).toBe(200)
  expect(syncTransactions).not.toHaveBeenCalled()
})

test('ignores other transaction webhook codes', async () => {
  const res = await post({ ...SYNC_BODY, webhook_code: 'RECURRING_TRANSACTIONS_UPDATE' })
  expect(res.status).toBe(200)
  expect(syncTransactions).not.toHaveBeenCalled()
})

test('ignores payloads without an item_id', async () => {
  const res = await post({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE' })
  expect(res.status).toBe(200)
  expect(syncTransactions).not.toHaveBeenCalled()
})

describe('with verification bypassed for local development', () => {
  beforeEach(() => {
    process.env.PLAID_WEBHOOK_VERIFICATION = 'off'
  })

  test('accepts an unsigned webhook and warns on every request', async () => {
    const res = await post(SYNC_BODY, { token: null })

    expect(res.status).toBe(200)
    expect(syncTransactions).toHaveBeenCalledWith('item_1')
    expect(console.warn).toHaveBeenCalledWith('plaid.webhook.verification_bypassed')
  })

  test('tolerates a body express.json does not parse', async () => {
    const res = await request(app).post('/api/plaid/webhook').set('Content-Type', 'text/plain').send('hello')

    expect(res.status).toBe(200)
    expect(syncTransactions).not.toHaveBeenCalled()
  })
})
