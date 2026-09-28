const db = require('./db')
const { plaidClient } = require('./plaid')
const { recordItemError } = require('./itemHealth')

// Pull all new transaction activity for one item via /transactions/sync,
// following the cursor until has_more is false, then apply added/modified/
// removed to the database. The cursor is only saved after a full successful
// pass; on TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION the pass restarts
// from the last saved cursor (mirrors Plaid's tutorial app).
async function syncTransactions(itemId, { maxRetries = 3 } = {}) {
  const item = await db.getItemByItemId(itemId)
  if (!item) throw new Error(`Unknown item: ${itemId}`)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const added = []
      const modified = []
      const removed = []
      let cursor = item.transaction_cursor || undefined
      let hasMore = true

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: item.access_token,
          cursor,
        })
        added.push(...response.data.added)
        modified.push(...response.data.modified)
        removed.push(...response.data.removed)
        cursor = response.data.next_cursor
        hasMore = response.data.has_more
      }

      for (const txn of added) await db.upsertTransaction(txn)
      for (const txn of modified) await db.upsertTransaction(txn)
      for (const txn of removed) await db.markTransactionRemoved(txn.transaction_id)

      await db.saveCursor(itemId, cursor)
      await db.markItemSynced(itemId)
      return { added: added.length, modified: modified.length, removed: removed.length }
    } catch (err) {
      const code = err?.response?.data?.error_code
      if (code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        continue
      }
      await recordItemError(itemId, err)
      throw err
    }
  }
}

module.exports = { syncTransactions }
