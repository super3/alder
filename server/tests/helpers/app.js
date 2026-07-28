const express = require('express')
const { captureRawBody } = require('../../src/plaidWebhookVerify')

// Build a minimal app around a router, mirroring index.js wiring: JSON body
// parsing (with the same raw-body capture, imported rather than re-declared so
// the harness cannot drift from production), an injected authenticated user,
// and the central error handler.
function makeApp(router, { userId = 'user_1' } = {}) {
  const app = express()
  app.use(express.json({ verify: captureRawBody }))
  app.use((req, res, next) => {
    if (userId) req.userId = userId
    next()
  })
  app.use('/api/plaid', router)
  app.use((err, req, res, _next) => {
    res.status(500).json({ error: 'Internal error' })
  })
  return app
}

module.exports = { makeApp }
