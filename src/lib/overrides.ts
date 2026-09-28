import type { OverridePatch, PlaidTransaction } from '../api'

// Applies a saved edit locally, with the same semantics as the server's PUT:
// a field absent from the patch is left alone, and null resets it to Plaid's.
export function applyPatch(txn: PlaidTransaction, patch: OverridePatch): PlaidTransaction {
  return {
    ...txn,
    ...('merchant_name' in patch ? { override_merchant_name: patch.merchant_name ?? null } : {}),
    ...('category' in patch ? { override_category: patch.category ?? null } : {}),
  }
}
