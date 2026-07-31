require('dotenv').config()

const express = require('express')
const cors = require('cors')
const { clerkMiddleware } = require('@clerk/express')

const { requireAuth } = require('./middleware/auth')
const { captureRawBody } = require('./plaidWebhookVerify')
const tokensRouter = require('./routes/tokens')
const balancesRouter = require('./routes/balances')
const transactionsRouter = require('./routes/transactions')
const webhookRouter = require('./routes/webhook')

const app = express()

app.use(
  cors({
    origin: [
      'https://aldermoney.com',
      'https://www.aldermoney.com',
      /^http:\/\/localhost:\d+$/,
    ],
  }),
)
// `verify` only attaches req.rawBody — parsing is unchanged for every route —
// and the webhook needs the exact bytes Plaid signed.
app.use(express.json({ verify: captureRawBody }))

app.get('/health', (req, res) => res.json({ ok: true }))

// Webhook receiver comes before auth — Plaid calls it server-to-server.
app.use('/api/plaid', webhookRouter)

// Everything else requires a signed-in Clerk user.
app.use(clerkMiddleware())
app.use('/api/plaid', requireAuth, tokensRouter)
app.use('/api/plaid', requireAuth, balancesRouter)
app.use('/api/plaid', requireAuth, transactionsRouter)

// Central error handler: log Plaid error payloads, never leak them raw.
app.use((err, req, res, _next) => {
  console.error('API error:', err?.response?.data || err)
  res.status(500).json({ error: 'Internal error' })
})

const port = process.env.PORT || 3001
app.listen(port, () => {
  console.log(`Alder API listening on :${port} (Plaid env: ${process.env.PLAID_ENV || 'sandbox'})`)
})
