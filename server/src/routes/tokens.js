const express = require('express')
const db = require('../db')
const { plaidClient } = require('../plaid')
const { syncTransactions } = require('../sync')

const router = express.Router()

// Create a Link token for the signed-in user. The frontend passes this to
// Plaid Link (react-plaid-link) to open the bank-connection flow.
//
// With { item_id }, the token opens Link in update mode instead: the user signs
// back in to an existing connection (after ITEM_LOGIN_REQUIRED, say) without
// creating a new item or re-requesting products.
router.post('/link-token', async (req, res, next) => {
  try {
    const { item_id: itemId } = req.body || {}
    const base = {
      user: { client_user_id: req.userId },
      client_name: 'Alder',
      country_codes: ['US'],
      language: 'en',
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
    }
    let request
    if (itemId) {
      const item = (await db.getItemsForUser(req.userId)).find((i) => i.item_id === itemId)
      if (!item) return res.status(404).json({ error: 'Unknown item' })
      request = { ...base, access_token: item.access_token }
    } else {
      request = { ...base, products: ['transactions'], transactions: { days_requested: 730 } }
    }
    const response = await plaidClient.linkTokenCreate(request)
    res.json({ link_token: response.data.link_token })
  } catch (err) {
    next(err)
  }
})

// Exchange the public token from Link's onSuccess for a permanent access
// token, then enrich the item (institution name, accounts) and kick off the
// first transaction sync — mirroring Plaid's tutorial app.
router.post('/exchange', async (req, res, next) => {
  try {
    const { public_token: publicToken } = req.body
    if (!publicToken) return res.status(400).json({ error: 'public_token is required' })

    const exchange = await plaidClient.itemPublicTokenExchange({ public_token: publicToken })
    const accessToken = exchange.data.access_token
    const itemId = exchange.data.item_id
    await db.addItem(req.userId, itemId, accessToken)

    // Institution name for the Connected accounts screen.
    let institutionName = null
    try {
      const itemInfo = await plaidClient.itemGet({ access_token: accessToken })
      const institutionId = itemInfo.data.item.institution_id
      if (institutionId) {
        const inst = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: ['US'],
        })
        institutionName = inst.data.institution.name
        await db.setInstitution(itemId, institutionId, institutionName)
      }
    } catch (err) {
      console.error('Institution enrichment failed:', err?.response?.data || err.message)
    }

    // Store the item's accounts up front.
    const accounts = await plaidClient.accountsGet({ access_token: accessToken })
    for (const account of accounts.data.accounts) {
      await db.upsertAccount(itemId, account)
    }

    // First transaction pull; don't block the response on it.
    syncTransactions(itemId).catch((err) =>
      console.error('Initial sync failed:', err?.response?.data || err.message),
    )

    res.json({
      item_id: itemId,
      institution_name: institutionName,
      accounts: accounts.data.accounts.length,
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
