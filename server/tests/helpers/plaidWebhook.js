// Signs Plaid-shaped webhook JWTs in-process so the verifier can be tested
// without network access. One P-256 keypair per test process.
const crypto = require('crypto')

const KID = 'test-key-1'

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const other = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })

const b64 = (value) => Buffer.from(value).toString('base64url')

// Plaid returns the JWK with these extra fields alongside the EC parameters.
function jwkFor(key = publicKey, overrides = {}) {
  return {
    ...key.export({ format: 'jwk' }),
    kid: KID,
    use: 'sig',
    alg: 'ES256',
    created_at: 1700000000,
    expired_at: null,
    ...overrides,
  }
}

function sha256Hex(body) {
  return crypto.createHash('sha256').update(body).digest('hex')
}

// Signs `body` (a Buffer or string of the exact bytes that will be sent).
// Every claim and header field is overridable so attack cases can be built.
function sign(body, options = {}) {
  const {
    kid = KID,
    alg = 'ES256',
    iat = Math.floor(Date.now() / 1000),
    sha256 = sha256Hex(body),
    key = privateKey,
    claims,
  } = options

  const headerSeg = b64(JSON.stringify({ alg, kid, typ: 'JWT' }))
  const payloadSeg = b64(JSON.stringify(claims ?? { iat, request_body_sha256: sha256 }))
  const signature = crypto.sign(
    'sha256',
    Buffer.from(`${headerSeg}.${payloadSeg}`),
    { key, dsaEncoding: 'ieee-p1363' },
  )
  return `${headerSeg}.${payloadSeg}.${signature.toString('base64url')}`
}

// Correctly signs arbitrary (possibly malformed) segments — the only way to
// reach the claim-decoding branches, which sit after signature verification.
function signRaw(headerSeg, payloadSeg, key = privateKey) {
  const signature = crypto.sign(
    'sha256',
    Buffer.from(`${headerSeg}.${payloadSeg}`),
    { key, dsaEncoding: 'ieee-p1363' },
  )
  return `${headerSeg}.${payloadSeg}.${signature.toString('base64url')}`
}

module.exports = { KID, b64, jwkFor, sha256Hex, sign, signRaw, publicKey, privateKey, other }
