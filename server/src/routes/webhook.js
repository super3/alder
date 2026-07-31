const express = require('express')
const crypto = require('crypto')
const { syncTransactions } = require('../sync')
const { verifyPlaidWebhook } = require('../plaidWebhookVerify')

const router = express.Router()

// Running counts, logged on every outcome: `accepted: 0` beside a climbing
// `rejected` is the signature of a verifier that has silently frozen out all
// real traffic, and it needs to be visible from the logs alone.
let accepted = 0
let rejected = 0

// Plaid webhook receiver — mounted WITHOUT Clerk auth, because Plaid calls it
// server-to-server. The Plaid-Verification JWT is what authenticates the
// caller; without it this route lets anyone drive Plaid API calls on our
// account. Always answers quickly; work happens in the background.
router.post('/webhook', async (req, res) => {
  const result = await verifyPlaidWebhook(req.get('plaid-verification'), req.rawBody)

  if (!result.ok) {
    rejected += 1
    // The reason is for us: `bad_alg`/`missing_header` at volume is someone
    // probing, `body_hash_mismatch`/`missing_raw_body` is our own bug. The
    // caller is told nothing — all failure modes look identical from outside.
    console.warn(
      'plaid.webhook.rejected',
      JSON.stringify({ reason: result.reason, kid: result.kid, accepted, rejected }),
    )
    return res.status(401).json({ error: 'invalid webhook signature' })
  }

  if (result.bypassed) console.warn('plaid.webhook.verification_bypassed')

  accepted += 1
  const { webhook_type: type, webhook_code: code, item_id: itemId } = req.body || {}
  console.log(
    'plaid.webhook.accepted',
    JSON.stringify({
      webhook_type: type,
      webhook_code: code,
      // A stable correlation handle that is not itself an identifier.
      item: itemId ? crypto.createHash('sha256').update(itemId).digest('hex').slice(0, 8) : undefined,
      accepted,
      rejected,
    }),
  )

  if (type === 'TRANSACTIONS' && code === 'SYNC_UPDATES_AVAILABLE' && itemId) {
    syncTransactions(itemId).catch((err) =>
      console.error('Webhook-triggered sync failed:', err?.response?.data || err.message),
    )
  }

  res.json({ received: true })
})

module.exports = router
