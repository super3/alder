const express = require('express')
const db = require('../db')
const { syncTransactions } = require('../sync')
const { plaidErrorCode } = require('../itemHealth')

const router = express.Router()

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_PAGE = 500
const MAX_OVERRIDE_LENGTH = 120
const truthy = (value) => value === '1' || value === 'true'

function isoDaysAgo(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

// Sync all of the user's items now (the webhook also does this per item).
// Items are isolated: one that needs the user to sign in again reports its
// Plaid error code instead of failing the refresh for every other bank.
router.post('/sync', async (req, res, next) => {
  try {
    const items = await db.getItemsForUser(req.userId)
    const results = []
    for (const item of items) {
      try {
        const counts = await syncTransactions(item.item_id)
        results.push({ item_id: item.item_id, ok: true, ...counts })
      } catch (err) {
        const code = plaidErrorCode(err)
        if (!code) throw err
        results.push({ item_id: item.item_id, ok: false, error_code: code })
      }
    }
    res.json({ results })
  } catch (err) {
    next(err)
  }
})

// One page of synced transactions, most recent first, plus the total matching
// the same filters — so the client can say "200 of 812" instead of presenting
// a page as the whole history.
router.get('/transactions', async (req, res, next) => {
  try {
    const { start, end, account_id: accountId } = req.query
    if ((start && !ISO_DATE.test(start)) || (end && !ISO_DATE.test(end))) {
      return res.status(400).json({ error: 'start and end must be YYYY-MM-DD' })
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), MAX_PAGE)
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
    const filters = {
      start,
      end,
      accountId,
      pendingOnly: truthy(req.query.pending),
      incomeOnly: truthy(req.query.income),
      excludeTransfers: truthy(req.query.exclude_transfers),
    }
    const [transactions, total] = await Promise.all([
      db.getTransactionsForUser(req.userId, { ...filters, limit, offset }),
      db.countTransactionsForUser(req.userId, filters),
    ])
    res.json({ transactions, total })
  } catch (err) {
    next(err)
  }
})

// Per-day net, income and spending since `start` (default: one year ago),
// computed over every synced transaction rather than a page of them.
router.get('/transactions/daily', async (req, res, next) => {
  try {
    const start = req.query.start || isoDaysAgo(366)
    if (!ISO_DATE.test(start)) return res.status(400).json({ error: 'start must be YYYY-MM-DD' })
    const days = await db.getDailyTotals(req.userId, start)
    res.json({ days })
  } catch (err) {
    next(err)
  }
})

const OVERRIDE_FIELDS = { merchant_name: 'merchantName', category: 'category' }

// Save a user edit. Stored in transaction_overrides, which sync.js never
// touches, so a re-sync cannot clobber it. Partial: a field left out of the
// body is untouched, and a field set to null goes back to what Plaid supplied.
router.put('/transactions/:transactionId/override', async (req, res, next) => {
  try {
    const { transactionId } = req.params
    const body = req.body || {}
    const patch = {}
    for (const [field, key] of Object.entries(OVERRIDE_FIELDS)) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue
      const value = body[field]
      if (value === null) {
        patch[key] = null
        continue
      }
      const trimmed = typeof value === 'string' ? value.trim() : ''
      if (!trimmed || trimmed.length > MAX_OVERRIDE_LENGTH) {
        return res.status(400).json({ error: `${field} must be a non-empty string or null` })
      }
      patch[key] = trimmed
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' })
    }
    if (!(await db.ownsTransaction(req.userId, transactionId))) {
      return res.status(404).json({ error: 'Unknown transaction' })
    }
    await db.setTransactionOverride(req.userId, transactionId, patch)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Revert every edit on a transaction to what Plaid supplied.
router.delete('/transactions/:transactionId/override', async (req, res, next) => {
  try {
    const { transactionId } = req.params
    if (!(await db.ownsTransaction(req.userId, transactionId))) {
      return res.status(404).json({ error: 'Unknown transaction' })
    }
    await db.clearTransactionOverride(req.userId, transactionId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

module.exports = router
