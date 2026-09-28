const db = require('./db')

// Plaid error codes that mean the user has to go back through Link in update
// mode before the item will sync again. Anything else Plaid reports is
// recorded as a generic 'error'.
const LOGIN_REQUIRED = new Set([
  'ITEM_LOGIN_REQUIRED',
  'PENDING_EXPIRATION',
  'PENDING_DISCONNECT',
  'INVALID_CREDENTIALS',
  'INVALID_MFA',
  'ITEM_LOCKED',
  'USER_SETUP_REQUIRED',
  'USER_PERMISSION_REVOKED',
])

function plaidErrorCode(err) {
  return err?.response?.data?.error_code ?? null
}

function statusForCode(code) {
  return LOGIN_REQUIRED.has(code) ? 'login_required' : 'error'
}

// Records a Plaid-reported failure against the item. Errors that didn't come
// from Plaid (a database hiccup, a network blip on our side) say nothing about
// the bank connection, so they leave the status alone. Never throws: callers
// are already handling the original error.
async function recordItemError(itemId, err) {
  const code = plaidErrorCode(err)
  if (!code) return null
  try {
    await db.setItemStatus(itemId, statusForCode(code), code)
  } catch (statusErr) {
    console.error('Recording item status failed:', statusErr.message)
  }
  return code
}

// ITEM webhooks tell us about a broken or repaired connection before the next
// sync would have found out.
async function applyItemWebhook(itemId, code, body) {
  if (code === 'ERROR') {
    const errorCode = body?.error?.error_code ?? null
    await db.setItemStatus(itemId, statusForCode(errorCode), errorCode)
  } else if (code === 'PENDING_EXPIRATION' || code === 'PENDING_DISCONNECT' || code === 'USER_PERMISSION_REVOKED') {
    await db.setItemStatus(itemId, 'login_required', code)
  } else if (code === 'LOGIN_REPAIRED') {
    await db.setItemStatus(itemId, 'ok', null)
  }
}

module.exports = { LOGIN_REQUIRED, plaidErrorCode, statusForCode, recordItemError, applyItemWebhook }
