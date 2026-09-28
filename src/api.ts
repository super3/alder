// Authenticated client for the Alder API (server/). Requests carry the
// Clerk session token as a Bearer token, which @clerk/express verifies.
import { getClerk } from './clerk'

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || 'https://alder-production.up.railway.app'

export interface PlaidBalances {
  available: number | null
  current: number | null
  iso_currency_code: string | null
}

export interface PlaidAccount {
  account_id: string
  item_id: string
  name: string
  official_name: string | null
  mask: string | null
  type: string
  subtype: string | null
  balances: PlaidBalances
  institution_name: string | null
  /** When these balances were fetched from the bank. */
  balances_updated_at: string | null
  /** True when the bank couldn't be reached and these are last-known values. */
  stale: boolean
}

export interface PlaidTransaction {
  transaction_id: string
  account_id: string
  date: string
  name: string
  merchant_name: string | null
  amount: string | number
  iso_currency_code: string | null
  personal_finance_category: string | null
  pending: boolean
  account_name: string | null
  institution_name: string | null
  // User edits, stored separately server-side so a re-sync can't clobber them.
  override_merchant_name: string | null
  override_category: string | null
}

export type ItemStatus = 'ok' | 'login_required' | 'error'

export interface PlaidItem {
  item_id: string
  institution_name: string | null
  institution_id: string | null
  status: ItemStatus
  error_code: string | null
  last_synced_at: string | null
}

export interface DailyTotal {
  date: string
  /** Signed change in net worth that day (money in positive). */
  net: number
  /** Income and spending exclude transfers. */
  income: number
  spending: number
}

export type SyncResult =
  | { item_id: string; ok: true; added: number; modified: number; removed: number }
  | { item_id: string; ok: false; error_code: string }

export interface TransactionQuery {
  start?: string
  end?: string
  accountId?: string
  pendingOnly?: boolean
  incomeOnly?: boolean
  excludeTransfers?: boolean
  limit?: number
  offset?: number
}

/** A field set to null resets it to what Plaid supplied; an absent field is left alone. */
export interface OverridePatch {
  merchant_name?: string | null
  category?: string | null
}

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const clerk = await getClerk()
  const token = await clerk.session?.getToken()
  if (!token) throw new Error('Not signed in')

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<T>
}

function transactionParams(query: TransactionQuery): string {
  const params = new URLSearchParams()
  if (query.start) params.set('start', query.start)
  if (query.end) params.set('end', query.end)
  if (query.accountId) params.set('account_id', query.accountId)
  if (query.pendingOnly) params.set('pending', '1')
  if (query.incomeOnly) params.set('income', '1')
  if (query.excludeTransfers) params.set('exclude_transfers', '1')
  params.set('limit', String(query.limit ?? 100))
  if (query.offset) params.set('offset', String(query.offset))
  return params.toString()
}

export const api = {
  // With an itemId, opens Link in update mode to repair that connection.
  createLinkToken: (itemId?: string) =>
    authFetch<{ link_token: string }>('/api/plaid/link-token', {
      method: 'POST',
      body: JSON.stringify(itemId ? { item_id: itemId } : {}),
    }),
  exchangePublicToken: (publicToken: string) =>
    authFetch<{ item_id: string; institution_name: string | null; accounts: number }>('/api/plaid/exchange', {
      method: 'POST',
      body: JSON.stringify({ public_token: publicToken }),
    }),
  getBalances: () => authFetch<{ accounts: PlaidAccount[] }>('/api/plaid/balances'),
  getTransactions: (query: TransactionQuery = {}) =>
    authFetch<{ transactions: PlaidTransaction[]; total: number }>(
      `/api/plaid/transactions?${transactionParams(query)}`,
    ),
  getDailyTotals: (start?: string) =>
    authFetch<{ days: DailyTotal[] }>(`/api/plaid/transactions/daily${start ? `?start=${start}` : ''}`),
  syncTransactions: () => authFetch<{ results: SyncResult[] }>('/api/plaid/sync', { method: 'POST' }),
  getItems: () => authFetch<{ items: PlaidItem[] }>('/api/plaid/items'),
  removeItem: (itemId: string) =>
    authFetch<{ removed: string }>(`/api/plaid/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
  setOverride: (transactionId: string, patch: OverridePatch) =>
    authFetch<{ ok: true }>(`/api/plaid/transactions/${encodeURIComponent(transactionId)}/override`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
}
