// Verifies the Plaid-Verification JWT that Plaid attaches to every outgoing
// webhook (https://plaid.com/docs/api/webhooks/webhook-verification/).
//
// Without this, /api/plaid/webhook is an unauthenticated endpoint that anyone
// can use to drive Plaid API calls on our account. Verification is structural:
// the token's own `alg` never selects a verifier, it is only compared against
// ES256, so header-driven algorithm confusion is impossible.
const crypto = require('crypto')
const { plaidClient } = require('./plaid')

const ALG = 'ES256'
const MAX_TOKEN_LENGTH = 4096
const IAT_WINDOW_SECONDS = 300
const KID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i

const KEY_TTL_MS = 24 * 60 * 60 * 1000
const MISS_TTL_MS = 5 * 60 * 1000
const MAX_KEYS = 8
const MAX_MISSES = 64
const FETCH_BUDGET = 10
const FETCH_WINDOW_MS = 60 * 1000

// Real Plaid keys and forged-kid misses are kept apart on purpose. They shared
// one map at first, and because kid is attacker-controlled on an unauthenticated
// route, a flood of fresh kids evicted the live signing key and then starved its
// re-fetch — genuine webhooks 401'd for as long as the flood lasted. Only Plaid
// can put an entry in keyCache, so attacker traffic can no longer displace it.
const keyCache = new Map() // kid -> { jwk, expiresAt }
const missCache = new Map() // kid -> expiresAt
const knownKids = new Set() // kids Plaid has resolved before; exempt from the budget
const inflight = new Map()
let fetchCount = 0
let windowStartedAt = 0

// Body-parser turns a throw in here into a 400 for every route in the app, so
// this only ever attaches a property. Plaid signs the exact bytes on the wire,
// which is why the parsed body can never be re-serialized back into them.
const captureRawBody = (req, res, buf) => {
  req.rawBody = buf
}

// Sandbox may be pointed at a machine Plaid cannot reach, so local development
// gets an opt-out. It reads only process.env — nothing in an HTTP request can
// influence it — and it is inert outside sandbox.
function isVerificationEnforced() {
  const env = process.env.PLAID_ENV || 'sandbox'
  if (env !== 'sandbox') return true
  return process.env.PLAID_WEBHOOK_VERIFICATION !== 'off'
}

function fail(reason, kid) {
  return kid ? { ok: false, reason, kid } : { ok: false, reason }
}

function decodeSegment(segment) {
  try {
    const parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function evictOldest(cache, max) {
  if (cache.size > max) cache.delete(cache.keys().next().value)
}

// Bounds the amplification of forged kids into upstream Plaid calls. A spend is
// refunded when the fetch succeeds, so only failures — which is what attacker
// traffic produces — accumulate against the window.
function spendFetchBudget() {
  const now = Date.now()
  if (now - windowStartedAt > FETCH_WINDOW_MS) {
    windowStartedAt = now
    fetchCount = 0
  }
  if (fetchCount >= FETCH_BUDGET) return null
  fetchCount += 1
  return windowStartedAt
}

// Safe without a floor check: every same-window refund is paired with its own
// spend, and a window roll resets the counter *and* changes windowStartedAt, so
// a refund from the previous window is discarded rather than underflowing.
function refundFetchBudget(spentInWindow) {
  if (spentInWindow === windowStartedAt) fetchCount -= 1
}

async function fetchKey(kid, spentInWindow) {
  try {
    const response = await plaidClient.webhookVerificationKeyGet({ key_id: kid })
    const jwk = response?.data?.key
    // A rotated-out key must never verify a fresh webhook.
    if (!jwk || jwk.expired_at != null) {
      missCache.set(kid, Date.now() + MISS_TTL_MS)
      evictOldest(missCache, MAX_MISSES)
      return null
    }
    keyCache.set(kid, { jwk, expiresAt: Date.now() + KEY_TTL_MS })
    evictOldest(keyCache, MAX_KEYS)
    // Only Plaid can get a kid in here, so this set is not attacker-growable.
    knownKids.add(kid)
    evictOldest(knownKids, MAX_MISSES)
    if (spentInWindow !== null) refundFetchBudget(spentInWindow)
    return jwk
  } catch {
    missCache.set(kid, Date.now() + MISS_TTL_MS)
    evictOldest(missCache, MAX_MISSES)
    return null
  }
}

async function getKey(kid) {
  const cached = keyCache.get(kid)
  if (cached && cached.expiresAt > Date.now()) return cached.jwk

  const missedUntil = missCache.get(kid)
  if (missedUntil && missedUntil > Date.now()) return null

  const pending = inflight.get(kid)
  if (pending) return pending

  // Refreshing a kid Plaid has already vouched for must never be starved by a
  // flood of unknown ones — that was the bug that made this route DoS-able.
  let spentInWindow = null
  if (!knownKids.has(kid)) {
    spentInWindow = spendFetchBudget()
    if (spentInWindow === null) return null
  }

  const promise = fetchKey(kid, spentInWindow).finally(() => inflight.delete(kid))
  inflight.set(kid, promise)
  return promise
}

/**
 * @returns {Promise<{ok: true, bypassed: boolean} | {ok: false, reason: string, kid?: string}>}
 * Callers must treat every failure identically — the reason is for logs only.
 */
async function verifyPlaidWebhook(token, rawBody) {
  if (!isVerificationEnforced()) return { ok: true, bypassed: true }

  if (typeof token !== 'string') return fail('missing_header')
  if (token.length > MAX_TOKEN_LENGTH) return fail('token_too_large')
  if (!Buffer.isBuffer(rawBody)) return fail('missing_raw_body')

  const segments = token.split('.')
  if (segments.length !== 3) return fail('malformed_token')
  const [headerSeg, payloadSeg, signatureSeg] = segments

  const header = decodeSegment(headerSeg)
  if (!header) return fail('undecodable_header')
  // Compared against a constant, never used to look up a verifier.
  if (header.alg !== ALG) return fail('bad_alg')
  if (typeof header.kid !== 'string') return fail('missing_kid')
  if (!KID_PATTERN.test(header.kid)) return fail('bad_kid')
  const { kid } = header

  const jwk = await getKey(kid)
  if (!jwk) return fail('unknown_key', kid)

  let publicKey
  try {
    publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' })
  } catch {
    return fail('unusable_key', kid)
  }
  if (publicKey.asymmetricKeyType !== 'ec') return fail('non_ec_key', kid)
  if (publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return fail('non_p256_key', kid)

  // JWS carries a raw r‖s signature; Node defaults to DER, which would reject
  // every genuine webhook, hence dsaEncoding.
  const signature = Buffer.from(signatureSeg, 'base64url')
  if (signature.length !== 64) return fail('bad_signature_length', kid)
  const signingInput = Buffer.from(`${headerSeg}.${payloadSeg}`)
  const signatureValid = crypto.verify(
    'sha256',
    signingInput,
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    signature,
  )
  if (!signatureValid) return fail('bad_signature', kid)

  // Claims are only read once the signature is proven.
  const claims = decodeSegment(payloadSeg)
  if (!claims) return fail('undecodable_payload', kid)

  // Asserted explicitly: NaN comparisons are false, which would fail open.
  if (!Number.isFinite(claims.iat)) return fail('missing_iat', kid)
  if (Math.abs(Date.now() / 1000 - claims.iat) > IAT_WINDOW_SECONDS) {
    return fail('stale_or_future_iat', kid)
  }

  if (typeof claims.request_body_sha256 !== 'string') return fail('missing_body_hash', kid)
  // Length-checked first so timingSafeEqual can never throw on mismatched sizes.
  if (!SHA256_HEX_PATTERN.test(claims.request_body_sha256)) return fail('malformed_body_hash', kid)
  const actual = Buffer.from(crypto.createHash('sha256').update(rawBody).digest('hex'))
  const expected = Buffer.from(claims.request_body_sha256.toLowerCase())
  if (!crypto.timingSafeEqual(actual, expected)) return fail('body_hash_mismatch', kid)

  return { ok: true, bypassed: false }
}

// Test seam: module-level cache state would otherwise leak between cases.
function _resetVerifierState() {
  keyCache.clear()
  missCache.clear()
  knownKids.clear()
  inflight.clear()
  fetchCount = 0
  windowStartedAt = 0
}

module.exports = { captureRawBody, verifyPlaidWebhook, _resetVerifierState }
