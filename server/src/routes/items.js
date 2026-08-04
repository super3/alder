const express = require('express')
const db = require('../db')
const { plaidClient } = require('../plaid')

const router = express.Router()

// List the user's connected items, so the UI can offer to disconnect one.
router.get('/items', async (req, res, next) => {
  try {
    const items = await db.getItemsForUser(req.userId)
    res.json({
      items: items.map((item) => ({
        item_id: item.item_id,
        institution_name: item.institution_name,
        institution_id: item.institution_id,
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

    await plaidClient.itemRemove({ access_token: item.access_token })
    await db.deleteItem(req.userId, itemId)
    res.json({ removed: itemId })
  } catch (err) {
    next(err)
  }
})

module.exports = router
