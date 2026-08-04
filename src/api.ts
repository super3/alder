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
  name: string
  official_name: string | null
  mask: string | null
  type: string
  subtype: string | null
  balances: PlaidBalances
  institution_name: string | null
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

export interface PlaidItem {
  item_id: string
  institution_name: string | null
  institution_id: string | null
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

export const api = {
  createLinkToken: () => authFetch<{ link_token: string }>('/api/plaid/link-token', { method: 'POST' }),
  exchangePublicToken: (publicToken: string) =>
    authFetch<{ item_id: string; institution_name: string | null; accounts: number }>('/api/plaid/exchange', {
      method: 'POST',
      body: JSON.stringify({ public_token: publicToken }),
    }),
  getBalances: () => authFetch<{ accounts: PlaidAccount[] }>('/api/plaid/balances'),
  getTransactions: (limit = 200) =>
    authFetch<{ transactions: PlaidTransaction[] }>(`/api/plaid/transactions?limit=${limit}`),
  syncTransactions: () => authFetch<{ results: unknown[] }>('/api/plaid/sync', { method: 'POST' }),
  getItems: () => authFetch<{ items: PlaidItem[] }>('/api/plaid/items'),
  removeItem: (itemId: string) =>
    authFetch<{ removed: string }>(`/api/plaid/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
  setOverride: (transactionId: string, body: { merchant_name?: string | null; category?: string | null }) =>
    authFetch<{ ok: true }>(`/api/plaid/transactions/${encodeURIComponent(transactionId)}/override`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  clearOverride: (transactionId: string) =>
    authFetch<{ ok: true }>(`/api/plaid/transactions/${encodeURIComponent(transactionId)}/override`, {
      method: 'DELETE',
    }),
}
