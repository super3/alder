jest.mock('../src/plaid', () => ({ plaidClient: { webhookVerificationKeyGet: jest.fn() } }))

const crypto = require('crypto')
const { plaidClient } = require('../src/plaid')
const { verifyPlaidWebhook, _resetVerifierState } = require('../src/plaidWebhookVerify')
const { KID, b64, jwkFor, sha256Hex, sign, signRaw, publicKey, other } = require('./helpers/plaidWebhook')

const BODY = Buffer.from(JSON.stringify({ webhook_type: 'TRANSACTIONS', item_id: 'item_1' }))
const keyResponse = (overrides) => ({ data: { key: jwkFor(publicKey, overrides) } })

let realEnv

beforeEach(() => {
  _resetVerifierState()
  jest.clearAllMocks()
  realEnv = { ...process.env }
  process.env.PLAID_ENV = 'sandbox'
  delete process.env.PLAID_WEBHOOK_VERIFICATION
  plaidClient.webhookVerificationKeyGet.mockResolvedValue(keyResponse())
})

afterEach(() => {
  process.env = realEnv
  jest.restoreAllMocks()
})

describe('enforcement gate', () => {
  test('enforced by default when PLAID_ENV is unset', async () => {
    delete process.env.PLAID_ENV
    const result = await verifyPlaidWebhook(undefined, BODY)
    expect(result).toEqual({ ok: false, reason: 'missing_header' })
  })

  test('sandbox honors the explicit opt-out', async () => {
    process.env.PLAID_WEBHOOK_VERIFICATION = 'off'
    const result = await verifyPlaidWebhook(undefined, BODY)
    expect(result).toEqual({ ok: true, bypassed: true })
    expect(plaidClient.webhookVerificationKeyGet).not.toHaveBeenCalled()
  })

  test('the opt-out is inert outside sandbox', async () => {
    process.env.PLAID_ENV = 'production'
    process.env.PLAID_WEBHOOK_VERIFICATION = 'off'
    const result = await verifyPlaidWebhook(undefined, BODY)
    expect(result).toEqual({ ok: false, reason: 'missing_header' })
  })
})

describe('structural checks (no key fetch)', () => {
  const expectNoFetch = () => expect(plaidClient.webhookVerificationKeyGet).not.toHaveBeenCalled()

  test('rejects a missing header', async () => {
    expect(await verifyPlaidWebhook(undefined, BODY)).toEqual({ ok: false, reason: 'missing_header' })
    expectNoFetch()
  })

  test('rejects an oversized token', async () => {
    const result = await verifyPlaidWebhook('a'.repeat(5000), BODY)
    expect(result.reason).toBe('token_too_large')
    expectNoFetch()
  })

  test('rejects a non-Buffer raw body', async () => {
    const result = await verifyPlaidWebhook(sign(BODY), BODY.toString())
    expect(result.reason).toBe('missing_raw_body')
    expectNoFetch()
  })

  test('rejects a token without three segments', async () => {
    expect((await verifyPlaidWebhook('a.b', BODY)).reason).toBe('malformed_token')
    expectNoFetch()
  })

  test('rejects an undecodable header', async () => {
    expect((await verifyPlaidWebhook('!!!.b.c', BODY)).reason).toBe('undecodable_header')
    expect((await verifyPlaidWebhook(`${b64('null')}.b.c`, BODY)).reason).toBe('undecodable_header')
    expect((await verifyPlaidWebhook(`${b64('5')}.b.c`, BODY)).reason).toBe('undecodable_header')
    expectNoFetch()
  })

  test('rejects alg none', async () => {
    const token = `${b64(JSON.stringify({ alg: 'none', kid: KID }))}.${b64('{}')}.`
    expect((await verifyPlaidWebhook(token, BODY)).reason).toBe('bad_alg')
    expectNoFetch()
  })

  test('rejects HS256 algorithm confusion signed with the public key', async () => {
    const headerSeg = b64(JSON.stringify({ alg: 'HS256', kid: KID }))
    const payloadSeg = b64(JSON.stringify({ iat: Math.floor(Date.now() / 1000), request_body_sha256: sha256Hex(BODY) }))
    for (const secret of [publicKey.export({ type: 'spki', format: 'pem' }), JSON.stringify(jwkFor())]) {
      const mac = crypto.createHmac('sha256', secret).update(`${headerSeg}.${payloadSeg}`).digest('base64url')
      const result = await verifyPlaidWebhook(`${headerSeg}.${payloadSeg}.${mac}`, BODY)
      expect(result.reason).toBe('bad_alg')
    }
    expectNoFetch()
  })

  test('rejects a missing or malformed kid', async () => {
    const noKid = `${b64(JSON.stringify({ alg: 'ES256' }))}.${b64('{}')}.x`
    expect((await verifyPlaidWebhook(noKid, BODY)).reason).toBe('missing_kid')
    for (const kid of ['x'.repeat(65), '../../etc']) {
      const token = `${b64(JSON.stringify({ alg: 'ES256', kid }))}.${b64('{}')}.x`
      expect((await verifyPlaidWebhook(token, BODY)).reason).toBe('bad_kid')
    }
    expectNoFetch()
  })
})

describe('key resolution', () => {
  test('accepts a correctly signed token and fetches the key once', async () => {
    expect(await verifyPlaidWebhook(sign(BODY), BODY)).toEqual({ ok: true, bypassed: false })
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledWith({ key_id: KID })
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledTimes(1)
  })

  test('caches the key across verifications', async () => {
    await verifyPlaidWebhook(sign(BODY), BODY)
    await verifyPlaidWebhook(sign(BODY), BODY)
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledTimes(1)
  })

  test('refetches once the cache entry expires', async () => {
    await verifyPlaidWebhook(sign(BODY), BODY)
    const later = Date.now() + 25 * 60 * 60 * 1000
    jest.spyOn(Date, 'now').mockReturnValue(later)
    await verifyPlaidWebhook(sign(BODY, { iat: Math.floor(later / 1000) }), BODY)
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledTimes(2)
  })

  test('negative-caches an unknown kid so a flood costs one fetch', async () => {
    plaidClient.webhookVerificationKeyGet.mockRejectedValue(new Error('unknown key'))
    for (let i = 0; i < 25; i++) {
      expect((await verifyPlaidWebhook(sign(BODY), BODY)).reason).toBe('unknown_key')
    }
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledTimes(1)
  })

  test('rejects and negative-caches an expired key', async () => {
    plaidClient.webhookVerificationKeyGet.mockResolvedValue(keyResponse({ expired_at: 1700000001 }))
    expect((await verifyPlaidWebhook(sign(BODY), BODY)).reason).toBe('unknown_key')
    expect((await verifyPlaidWebhook(sign(BODY), BODY)).reason).toBe('unknown_key')
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledTimes(1)
  })

  test('rejects a response with no key', async () => {
    plaidClient.webhookVerificationKeyGet.mockResolvedValue({ data: {} })
    expect((await verifyPlaidWebhook(sign(BODY), BODY)).reason).toBe('unknown_key')
  })

  test('collapses concurrent fetches for the same kid', async () => {
    let release
    plaidClient.webhookVerificationKeyGet.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve(keyResponse())
      }),
    )
    const pending = [0, 1, 2].map(() => verifyPlaidWebhook(sign(BODY), BODY))
    release()
    for (const result of await Promise.all(pending)) expect(result.ok).toBe(true)
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledTimes(1)
  })

  test('caps fetches of unknown kids per window, then resumes after it rolls over', async () => {
    plaidClient.webhookVerificationKeyGet.mockRejectedValue(new Error('unknown key'))
    for (let i = 0; i < 11; i++) {
      await verifyPlaidWebhook(sign(BODY, { kid: `kid-${i}` }), BODY)
    }
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledTimes(10)

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61 * 1000)
    await verifyPlaidWebhook(sign(BODY, { kid: 'kid-after' }), BODY)
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledTimes(11)
  })

  test('a successful fetch does not consume the budget', async () => {
    for (let i = 0; i < 15; i++) {
      plaidClient.webhookVerificationKeyGet.mockResolvedValue(keyResponse({ kid: `real-${i}` }))
      const result = await verifyPlaidWebhook(sign(BODY, { kid: `real-${i}` }), BODY)
      expect(result.ok).toBe(true)
    }
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledTimes(15)
  })

  // Regression: forged kids used to evict the live key from a shared cache and
  // then starve its re-fetch, 401-ing genuine webhooks for the whole flood.
  test('a flood of forged kids cannot evict or starve the live key', async () => {
    expect((await verifyPlaidWebhook(sign(BODY), BODY)).ok).toBe(true)

    plaidClient.webhookVerificationKeyGet.mockRejectedValue(new Error('unknown key'))
    for (let i = 0; i < 200; i++) {
      await verifyPlaidWebhook(sign(BODY, { kid: `forged-${i}` }), BODY)
    }

    // Still served from cache, and the flood never reached Plaid more than the budget allows.
    expect(await verifyPlaidWebhook(sign(BODY), BODY)).toEqual({ ok: true, bypassed: false })
    expect(plaidClient.webhookVerificationKeyGet.mock.calls.length).toBeLessThanOrEqual(11)
  })

  test('a known kid can refresh even while the budget is exhausted', async () => {
    await verifyPlaidWebhook(sign(BODY), BODY)

    plaidClient.webhookVerificationKeyGet.mockRejectedValue(new Error('unknown key'))
    for (let i = 0; i < 20; i++) await verifyPlaidWebhook(sign(BODY, { kid: `forged-${i}` }), BODY)

    // The live key's 24h TTL lapses mid-flood: it must still be refetchable.
    const later = Date.now() + 25 * 60 * 60 * 1000
    jest.spyOn(Date, 'now').mockReturnValue(later)
    plaidClient.webhookVerificationKeyGet.mockResolvedValue(keyResponse())
    const result = await verifyPlaidWebhook(sign(BODY, { iat: Math.floor(later / 1000) }), BODY)
    expect(result).toEqual({ ok: true, bypassed: false })
  })

  test('discards a refund whose budget window has already rolled', async () => {
    const deferred = {}
    plaidClient.webhookVerificationKeyGet.mockImplementation(({ key_id: keyId }) =>
      keyId === 'slow'
        ? new Promise((resolve) => {
            deferred.resolve = () => resolve(keyResponse({ kid: 'slow' }))
          })
        : Promise.reject(new Error('unknown key')),
    )

    const start = Date.now()
    const slow = verifyPlaidWebhook(sign(BODY, { kid: 'slow' }), BODY) // spends in window 1
    jest.spyOn(Date, 'now').mockReturnValue(start + 61 * 1000)
    await verifyPlaidWebhook(sign(BODY, { kid: 'other' }), BODY) // rolls into window 2

    deferred.resolve() // refund carries window 1 and must be dropped
    expect((await slow).ok).toBe(true)

    // Window 2 kept the one slot it spent, so exactly nine remain.
    for (let i = 0; i < 10; i++) await verifyPlaidWebhook(sign(BODY, { kid: `after-${i}` }), BODY)
    expect(plaidClient.webhookVerificationKeyGet).toHaveBeenCalledTimes(11)
  })

  test('evicts the oldest key once the key cache is full', async () => {
    const nowSpy = jest.spyOn(Date, 'now')
    let clock = Date.now()
    nowSpy.mockImplementation(() => clock)
    for (let i = 0; i < 9; i++) {
      plaidClient.webhookVerificationKeyGet.mockResolvedValue(keyResponse({ kid: `kid-${i}` }))
      await verifyPlaidWebhook(sign(BODY, { kid: `kid-${i}`, iat: Math.floor(clock / 1000) }), BODY)
    }
    const fetchesBefore = plaidClient.webhookVerificationKeyGet.mock.calls.length
    await verifyPlaidWebhook(sign(BODY, { kid: 'kid-0', iat: Math.floor(clock / 1000) }), BODY)
    expect(plaidClient.webhookVerificationKeyGet.mock.calls.length).toBe(fetchesBefore + 1)
  })

  test('evicts the oldest miss once the miss cache is full', async () => {
    plaidClient.webhookVerificationKeyGet.mockRejectedValue(new Error('unknown key'))
    const nowSpy = jest.spyOn(Date, 'now')
    let clock = Date.now()
    nowSpy.mockImplementation(() => clock)
    for (let i = 0; i < 65; i++) {
      clock += 61 * 1000 // roll the budget window so every miss reaches the cache
      await verifyPlaidWebhook(sign(BODY, { kid: `miss-${i}`, iat: Math.floor(clock / 1000) }), BODY)
    }
    const fetchesBefore = plaidClient.webhookVerificationKeyGet.mock.calls.length
    clock += 61 * 1000
    await verifyPlaidWebhook(sign(BODY, { kid: 'miss-0', iat: Math.floor(clock / 1000) }), BODY)
    expect(plaidClient.webhookVerificationKeyGet.mock.calls.length).toBe(fetchesBefore + 1)
  })
})

describe('key material', () => {
  test('rejects an unusable JWK', async () => {
    plaidClient.webhookVerificationKeyGet.mockResolvedValue({ data: { key: { ...jwkFor(), x: '!!!!' } } })
    expect((await verifyPlaidWebhook(sign(BODY), BODY)).reason).toBe('unusable_key')
  })

  test('rejects a non-EC key', async () => {
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    plaidClient.webhookVerificationKeyGet.mockResolvedValue({ data: { key: rsa.publicKey.export({ format: 'jwk' }) } })
    expect((await verifyPlaidWebhook(sign(BODY), BODY)).reason).toBe('non_ec_key')
  })

  test('rejects a curve other than P-256', async () => {
    const p384 = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
    plaidClient.webhookVerificationKeyGet.mockResolvedValue({ data: { key: p384.publicKey.export({ format: 'jwk' }) } })
    expect((await verifyPlaidWebhook(sign(BODY), BODY)).reason).toBe('non_p256_key')
  })
})

describe('signature', () => {
  test('rejects a signature of the wrong length', async () => {
    const [header, payload] = sign(BODY).split('.')
    const result = await verifyPlaidWebhook(`${header}.${payload}.${b64('short')}`, BODY)
    expect(result.reason).toBe('bad_signature_length')
  })

  test('rejects a token signed by a different key', async () => {
    const result = await verifyPlaidWebhook(sign(BODY, { key: other.privateKey }), BODY)
    expect(result.reason).toBe('bad_signature')
  })
})

describe('claims', () => {
  test('rejects an undecodable payload', async () => {
    const token = signRaw(b64(JSON.stringify({ alg: 'ES256', kid: KID })), b64('not json'))
    expect((await verifyPlaidWebhook(token, BODY)).reason).toBe('undecodable_payload')
  })

  test('rejects a missing or non-numeric iat', async () => {
    expect((await verifyPlaidWebhook(sign(BODY, { claims: { request_body_sha256: sha256Hex(BODY) } }), BODY)).reason)
      .toBe('missing_iat')
    expect((await verifyPlaidWebhook(sign(BODY, { iat: '123' }), BODY)).reason).toBe('missing_iat')
  })

  test('rejects a stale or future iat', async () => {
    const now = Math.floor(Date.now() / 1000)
    expect((await verifyPlaidWebhook(sign(BODY, { iat: now - 400 }), BODY)).reason).toBe('stale_or_future_iat')
    expect((await verifyPlaidWebhook(sign(BODY, { iat: now + 400 }), BODY)).reason).toBe('stale_or_future_iat')
  })

  test('rejects a missing or malformed body hash', async () => {
    expect((await verifyPlaidWebhook(sign(BODY, { claims: { iat: Math.floor(Date.now() / 1000) } }), BODY)).reason)
      .toBe('missing_body_hash')
    expect((await verifyPlaidWebhook(sign(BODY, { sha256: 'abc' }), BODY)).reason).toBe('malformed_body_hash')
  })

  test('rejects a body that does not match the signed digest', async () => {
    const result = await verifyPlaidWebhook(sign(BODY), Buffer.from('{"item_id":"someone_else"}'))
    expect(result.reason).toBe('body_hash_mismatch')
    expect(result.kid).toBe(KID)
  })

  test('accepts an uppercase digest', async () => {
    const token = sign(BODY, { sha256: sha256Hex(BODY).toUpperCase() })
    expect(await verifyPlaidWebhook(token, BODY)).toEqual({ ok: true, bypassed: false })
  })
})
