const express = require('express')
const db = require('../db')
const { syncTransactions } = require('../sync')

const router = express.Router()

// Sync all of the user's items now (the webhook also does this per item).
router.post('/sync', async (req, res, next) => {
  try {
    const items = await db.getItemsForUser(req.userId)
    const results = []
    for (const item of items) {
      const counts = await syncTransactions(item.item_id)
      results.push({ item_id: item.item_id, ...counts })
    }
    res.json({ results })
  } catch (err) {
    next(err)
  }
})

// Read synced transactions from the database (most recent first).
router.get('/transactions', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500)
    const transactions = await db.getTransactionsForUser(req.userId, limit)
    res.json({ transactions })
  } catch (err) {
    next(err)
  }
})

// Save a user edit. Stored in transaction_overrides, which sync.js never
// touches, so a re-sync cannot clobber it.
router.put('/transactions/:transactionId/override', async (req, res, next) => {
  try {
    const { transactionId } = req.params
    const { merchant_name: merchantName, category } = req.body || {}
    if (!(await db.ownsTransaction(req.userId, transactionId))) {
      return res.status(404).json({ error: 'Unknown transaction' })
    }
    await db.setTransactionOverride(req.userId, transactionId, { merchantName, category })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Revert to whatever Plaid supplied.
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
