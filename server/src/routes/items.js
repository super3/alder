const express = require('express')
const db = require('../db')
const { plaidClient } = require('../plaid')
const { plaidErrorCode } = require('../itemHealth')

const router = express.Router()

// Plaid errors that mean the item no longer exists on Plaid's side.
const ALREADY_REMOVED = new Set(['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN'])

// List the user's connected items with their connection health, so the UI can
// offer to reconnect or disconnect one. Access tokens never leave the server.
router.get('/items', async (req, res, next) => {
  try {
    const items = await db.getItemsForUser(req.userId)
    res.json({
      items: items.map((item) => ({
        item_id: item.item_id,
        institution_name: item.institution_name,
        institution_id: item.institution_id,
        status: item.status,
        error_code: item.error_code,
        last_synced_at: item.last_synced_at ? new Date(item.last_synced_at).toISOString() : null,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// Disconnect a bank. Calling Plaid's /item/remove is the part that actually
// matters: Plaid bills per Item per month for as long as a valid access_token
// exists, so dropping our rows without telling Plaid would keep the meter
// running forever.
router.delete('/items/:itemId', async (req, res, next) => {
  try {
    const { itemId } = req.params
    const items = await db.getItemsForUser(req.userId)
    const item = items.find((i) => i.item_id === itemId)
    if (!item) return res.status(404).json({ error: 'Unknown item' })

    try {
      await plaidClient.itemRemove({ access_token: item.access_token })
    } catch (err) {
      // A retry after our half failed last time: Plaid has already forgotten
      // the item, so finish removing our rows instead of erroring forever.
      if (!ALREADY_REMOVED.has(plaidErrorCode(err))) throw err
    }
    await db.deleteItem(req.userId, itemId)
    res.json({ removed: itemId })
  } catch (err) {
    next(err)
  }
})

module.exports = router
