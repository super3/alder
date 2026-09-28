const express = require('express')
const db = require('../db')
const { plaidClient } = require('../plaid')
const { plaidErrorCode, recordItemError } = require('../itemHealth')

const router = express.Router()

const numberOrNull = (value) => (value == null ? null : Number(value))
const isoOrNull = (value) => (value == null ? null : new Date(value).toISOString())

// Real-time balances across all of the user's connected items via
// /accounts/balance/get (fresh fetch from the institution), updating the
// stored copies as a side effect.
//
// Items are fetched independently. One bank that needs the user to sign in
// again used to fail the whole request, which blanked every screen; now that
// bank is marked and its last-known balances are served, flagged as stale.
router.get('/balances', async (req, res, next) => {
  try {
    const items = await db.getItemsForUser(req.userId)
    const accounts = []

    for (const item of items) {
      try {
        const response = await plaidClient.accountsBalanceGet({ access_token: item.access_token })
        const updatedAt = new Date().toISOString()
        if (item.status !== 'ok') await db.setItemStatus(item.item_id, 'ok', null)
        for (const account of response.data.accounts) {
          await db.upsertAccount(item.item_id, account)
          accounts.push({
            account_id: account.account_id,
            item_id: item.item_id,
            name: account.name,
            official_name: account.official_name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            balances: {
              available: account.balances.available,
              current: account.balances.current,
              iso_currency_code: account.balances.iso_currency_code,
            },
            institution_name: item.institution_name,
            balances_updated_at: updatedAt,
            stale: false,
          })
        }
      } catch (err) {
        // Not Plaid's doing (e.g. our database) — that's a real server error.
        if (!plaidErrorCode(err)) throw err
        await recordItemError(item.item_id, err)
        for (const row of await db.getAccountsForItem(item.item_id)) {
          accounts.push({
            account_id: row.account_id,
            item_id: item.item_id,
            name: row.name,
            official_name: row.official_name,
            mask: row.mask,
            type: row.type,
            subtype: row.subtype,
            balances: {
              available: numberOrNull(row.available_balance),
              current: numberOrNull(row.current_balance),
              iso_currency_code: row.iso_currency_code,
            },
            institution_name: item.institution_name,
            balances_updated_at: isoOrNull(row.balances_updated_at),
            stale: true,
          })
        }
      }
    }

    res.json({ accounts })
  } catch (err) {
    next(err)
  }
})

module.exports = router
