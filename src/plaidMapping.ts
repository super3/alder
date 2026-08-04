// Maps live Plaid API data into the shapes the design screens render
// (AccountGroup / TransactionDay / summary / cash flow / institutions).
import type { PlaidAccount, PlaidItem, PlaidTransaction } from './api'
import {
  CATEGORIES,
  type Account,
  type AccountGroup,
  type Category,
  type Institution,
  type Transaction,
  type TransactionDay,
} from './data'

const AVATAR_PALETTE = [
  { bg: 'oklch(0.95 0.04 250)', fg: 'oklch(0.42 0.09 250)' },
  { bg: 'oklch(0.95 0.04 145)', fg: 'oklch(0.42 0.09 145)' },
  { bg: 'oklch(0.95 0.05 85)', fg: 'oklch(0.45 0.09 85)' },
  { bg: 'oklch(0.95 0.04 165)', fg: 'oklch(0.4 0.09 165)' },
  { bg: 'oklch(0.95 0.04 300)', fg: 'oklch(0.42 0.09 300)' },
  { bg: 'oklch(0.95 0.05 25)', fg: 'oklch(0.45 0.11 25)' },
  { bg: 'oklch(0.95 0.04 210)', fg: 'oklch(0.42 0.08 210)' },
]

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash
}

export function avatarFor(name: string) {
  return AVATAR_PALETTE[hashString(name) % AVATAR_PALETTE.length]
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '··'
  const letters = words.length >= 2 ? [words[0][0], words[1][0]] : [words[0][0], words[0][1] ?? '']
  return letters.join('').toUpperCase()
}

export function formatMoney(value: number | string | null, currency: string | null = 'USD'): string {
  if (value == null) return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(num)
}

function toDesignAccount(account: PlaidAccount): Account {
  const label = account.institution_name || account.name
  const { bg, fg } = avatarFor(label)
  const subtype = account.subtype
    ? account.subtype.charAt(0).toUpperCase() + account.subtype.slice(1)
    : account.type.charAt(0).toUpperCase() + account.type.slice(1)
  return {
    id: account.account_id,
    name: account.name + (account.mask ? ` ·· ${account.mask}` : ''),
    institution: `${account.institution_name || 'Connected'} · ${subtype}`,
    balance: formatMoney(account.balances.current, account.balances.iso_currency_code),
    initials: initialsOf(label),
    avatarBg: bg,
    avatarFg: fg,
    updated: 'just now',
  }
}

const GROUP_FOR_TYPE: Record<string, AccountGroup['id']> = {
  depository: 'cash',
  credit: 'credit',
  investment: 'invest',
  brokerage: 'invest',
  loan: 'loans',
  other: 'property',
}

const GROUP_LABELS: Record<AccountGroup['id'], string> = {
  cash: 'Cash',
  credit: 'Credit cards',
  invest: 'Investments',
  property: 'Property',
  loans: 'Loans',
}

export function mapAccountsToGroups(accounts: PlaidAccount[]): AccountGroup[] {
  const byGroup = new Map<AccountGroup['id'], { accounts: Account[]; total: number }>()
  for (const account of accounts) {
    const groupId = GROUP_FOR_TYPE[account.type] || 'property'
    const entry = byGroup.get(groupId) || { accounts: [], total: 0 }
    entry.accounts.push(toDesignAccount(account))
    entry.total += account.balances.current ?? 0
    byGroup.set(groupId, entry)
  }
  const order: AccountGroup['id'][] = ['cash', 'credit', 'invest', 'property', 'loans']
  return order
    .filter((id) => byGroup.has(id))
    .map((id) => ({
      id,
      label: GROUP_LABELS[id],
      changeNote: 'Live from Plaid Sandbox',
      total: formatMoney(byGroup.get(id)!.total),
      accounts: byGroup.get(id)!.accounts,
    }))
}

export interface LiveSummary {
  assets: { total: string; segments: { label: string; width: string; color: string; amount: string; percent: string }[] }
  liabilities: { total: string; segments: { label: string; width: string; color: string; amount: string; percent: string }[] }
  netWorth: string
}

const ASSET_COLORS: Record<string, string> = {
  Investments: 'oklch(0.62 0.12 165)',
  Cash: 'oklch(0.62 0.12 85)',
  Property: 'oklch(0.62 0.12 250)',
}

const LIABILITY_COLORS: Record<string, string> = {
  Loans: 'oklch(0.62 0.12 300)',
  'Credit cards': 'oklch(0.62 0.12 330)',
}

function buildSegments(parts: { label: string; amount: number }[], colors: Record<string, string>) {
  const total = parts.reduce((sum, part) => sum + part.amount, 0)
  return parts
    .filter((part) => part.amount > 0)
    .map((part) => {
      const pct = total > 0 ? (part.amount / total) * 100 : 0
      return {
        label: part.label,
        width: `${pct.toFixed(1)}%`,
        color: colors[part.label] || 'oklch(0.62 0.12 25)',
        amount: formatMoney(part.amount),
        percent: `${pct.toFixed(1)}%`,
      }
    })
}

export function buildLiveSummary(accounts: PlaidAccount[]): LiveSummary {
  const sums: Record<string, number> = {}
  for (const account of accounts) {
    const groupId = GROUP_FOR_TYPE[account.type] || 'property'
    const label = GROUP_LABELS[groupId]
    sums[label] = (sums[label] || 0) + (account.balances.current ?? 0)
  }
  const assetParts = ['Investments', 'Cash', 'Property']
    .map((label) => ({ label, amount: sums[label] || 0 }))
  const liabilityParts = ['Loans', 'Credit cards'].map((label) => ({ label, amount: sums[label] || 0 }))
  const assetTotal = assetParts.reduce((sum, part) => sum + part.amount, 0)
  const liabilityTotal = liabilityParts.reduce((sum, part) => sum + part.amount, 0)
  return {
    assets: { total: formatMoney(assetTotal), segments: buildSegments(assetParts, ASSET_COLORS) },
    liabilities: { total: formatMoney(liabilityTotal), segments: buildSegments(liabilityParts, LIABILITY_COLORS) },
    netWorth: formatMoney(assetTotal - liabilityTotal),
  }
}

// Plaid personal_finance_category.primary -> the design's category pills.
const CATEGORY_FOR_PFC: Record<string, Category> = {
  FOOD_AND_DRINK: CATEGORIES.dining,
  GENERAL_MERCHANDISE: CATEGORIES.shopping,
  GENERAL_SERVICES: CATEGORIES.shopping,
  TRANSPORTATION: CATEGORIES.transport,
  TRAVEL: CATEGORIES.transport,
  ENTERTAINMENT: CATEGORIES.entertainment,
  RENT_AND_UTILITIES: CATEGORIES.utilities,
  INCOME: CATEGORIES.income,
  TRANSFER_IN: CATEGORIES.transfer,
  TRANSFER_OUT: CATEGORIES.transfer,
  LOAN_PAYMENTS: CATEGORIES.transfer,
  BANK_FEES: CATEGORIES.utilities,
  HOME_IMPROVEMENT: CATEGORIES.shopping,
  MEDICAL: CATEGORIES.utilities,
  PERSONAL_CARE: CATEGORIES.shopping,
  GOVERNMENT_AND_NON_PROFIT: CATEGORIES.utilities,
}

// A user-chosen category name wins; otherwise fall back to Plaid's mapping.
// Unknown names still render, borrowing the transfer chip's neutral colours.
function categoryFor(pfc: string | null, override?: string | null): Category {
  if (override) {
    const known = Object.values(CATEGORIES).find((c) => c.name === override)
    return known ?? { ...CATEGORIES.transfer, name: override, emoji: '🏷️' }
  }
  if (pfc && CATEGORY_FOR_PFC[pfc]) return CATEGORY_FOR_PFC[pfc]
  return CATEGORIES.transfer
}

function dayLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000)
  const formatted = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (diffDays === 0) return `Today · ${formatted}`
  if (diffDays === 1) return `Yesterday · ${formatted}`
  return formatted
}

function signedAmount(txn: PlaidTransaction): number {
  const amount = typeof txn.amount === 'string' ? parseFloat(txn.amount) : txn.amount
  return -amount // Plaid: positive = money out, so flip to a natural sign
}

function accountFor(txn: PlaidTransaction) {
  const name = txn.account_name || txn.institution_name || 'Connected account'
  const { bg, fg } = avatarFor(name)
  return { id: txn.account_id, name, initials: initialsOf(name), avatarBg: bg, avatarFg: fg }
}

function toDesignTransaction(txn: PlaidTransaction, sub: string): Transaction {
  const amount = signedAmount(txn)
  const positive = amount > 0
  const plaidMerchant = txn.merchant_name || txn.name
  // A saved edit wins over whatever Plaid supplied.
  const merchant = txn.override_merchant_name || plaidMerchant
  const { bg, fg } = avatarFor(merchant)
  return {
    id: txn.transaction_id,
    plaidMerchant,
    statementName: txn.name,
    edited: Boolean(txn.override_merchant_name || txn.override_category),
    merchant: merchant + (txn.pending ? ' (pending)' : ''),
    sub,
    category: categoryFor(txn.personal_finance_category, txn.override_category),
    amount: `${positive ? '+' : '−'}${formatMoney(Math.abs(amount), txn.iso_currency_code).replace('-', '')}`,
    positive,
    initials: initialsOf(merchant),
    avatarBg: bg,
    avatarFg: fg,
    account: accountFor(txn),
  }
}

// The API contract is YYYY-MM-DD, but be tolerant of full ISO timestamps
// (Postgres DATE columns serialize that way if not normalized server-side).
function dateOnly(value: string): string {
  return value.slice(0, 10)
}

// Flat "Jul 12 · Category" list for the Dashboard and account-detail cards.
export function mapTransactionsToRecent(transactions: PlaidTransaction[], limit = 5): Transaction[] {
  return transactions.slice(0, limit).map((txn) => {
    const date = new Date(`${dateOnly(txn.date)}T00:00:00`)
    const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return toDesignTransaction(txn, `${formatted} · ${categoryFor(txn.personal_finance_category).name}`)
  })
}

export interface CashFlow {
  month: string
  income: string
  spending: string
  net: string
  netPositive: boolean
  incomeWidth: string
  spendingWidth: string
}

// Income vs. spending for the current calendar month (transfers excluded).
export function buildCashFlow(transactions: PlaidTransaction[]): CashFlow {
  const now = new Date()
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  let income = 0
  let spending = 0
  for (const txn of transactions) {
    if (!txn.date.startsWith(prefix)) continue
    const pfc = txn.personal_finance_category || ''
    if (pfc.startsWith('TRANSFER')) continue
    const amount = typeof txn.amount === 'string' ? parseFloat(txn.amount) : txn.amount
    if (amount < 0) income += -amount
    else spending += amount
  }
  const max = Math.max(income, spending)
  const net = income - spending
  return {
    month: now.toLocaleDateString('en-US', { month: 'long' }),
    income: formatMoney(income),
    spending: formatMoney(spending),
    net: `${net >= 0 ? '+' : '−'}${formatMoney(Math.abs(net))}`,
    netPositive: net >= 0,
    incomeWidth: max > 0 ? `${Math.round((income / max) * 100)}%` : '0%',
    spendingWidth: max > 0 ? `${Math.round((spending / max) * 100)}%` : '0%',
  }
}

export interface NetWorthPoint {
  date: string
  value: number
}

export interface NetWorthHistory {
  points: NetWorthPoint[]
  current: number
  change: string
  changePositive: boolean
  changeLabel: string
  /** True once there are at least two distinct days to draw a line between. */
  plottable: boolean
}

const RANGE_MONTHS: Record<string, number> = {
  '1 month': 1,
  '3 months': 3,
  '6 months': 6,
  '1 year': 12,
}

function netWorthOf(accounts: PlaidAccount[]): number {
  let total = 0
  for (const account of accounts) {
    const groupId = GROUP_FOR_TYPE[account.type] || 'property'
    const balance = account.balances.current ?? 0
    // Credit and loan balances are amounts owed, so they subtract.
    total += groupId === 'credit' || groupId === 'loans' ? -balance : balance
  }
  return total
}

// Reconstructs net worth backwards from today using the transaction stream.
//
// Every transaction moves net worth by exactly its signed amount, for assets
// and liabilities alike: a $100 card purchase is -100 (owed goes up), and
// paying that card from checking is -100 on checking and +100 on the card,
// which correctly nets to zero when both accounts are connected. So
// netWorth(T) = netWorth(now) - sum of signed amounts dated after T.
//
// This cannot see investment market movement, or anything before the earliest
// synced transaction — the card labels that rather than implying otherwise.
export function buildNetWorthHistory(
  accounts: PlaidAccount[],
  transactions: PlaidTransaction[],
  range: string,
): NetWorthHistory {
  const current = netWorthOf(accounts)
  const months = RANGE_MONTHS[range] ?? 1

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setMonth(start.getMonth() - months)

  // Net movement per day, most recent first.
  const netByDay = new Map<string, number>()
  for (const txn of transactions) {
    const day = dateOnly(txn.date)
    netByDay.set(day, (netByDay.get(day) || 0) + signedAmount(txn))
  }

  const points: NetWorthPoint[] = []
  let running = current
  for (let cursor = new Date(today); cursor >= start; cursor.setDate(cursor.getDate() - 1)) {
    const day = cursor.toISOString().slice(0, 10)
    points.unshift({ date: day, value: running })
    running -= netByDay.get(day) || 0
  }

  const first = points[0]?.value ?? current
  const delta = current - first
  const distinct = new Set(points.map((p) => p.value)).size

  return {
    points,
    current,
    change: `${delta >= 0 ? '↑' : '↓'} ${formatMoney(Math.abs(delta))}`,
    changePositive: delta >= 0,
    changeLabel: `${range} change`,
    plottable: points.length > 1 && distinct > 1,
  }
}

export function mapAccountsToInstitutions(accounts: PlaidAccount[], items: PlaidItem[] = []): Institution[] {
  const counts = new Map<string, number>()
  for (const account of accounts) {
    const name = account.institution_name || 'Connected bank'
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  return [...counts.entries()].map(([name, count]) => {
    const { bg, fg } = avatarFor(name)
    return {
      name,
      itemId: items.find((i) => i.institution_name === name)?.item_id,
      sub: `${count} account${count === 1 ? '' : 's'} · Plaid`,
      initials: initialsOf(name),
      avatarBg: bg,
      avatarFg: fg,
      status: 'connected' as const,
    }
  })
}

export function mapTransactionsToDays(transactions: PlaidTransaction[]): TransactionDay[] {
  const byDate = new Map<string, { txns: Transaction[]; net: number }>()
  for (const txn of transactions) {
    const mapped = toDesignTransaction(txn, txn.account_name || txn.institution_name || 'Connected account')
    const day = dateOnly(txn.date)
    const entry = byDate.get(day) || { txns: [], net: 0 }
    entry.txns.push(mapped)
    entry.net += signedAmount(txn)
    byDate.set(day, entry)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, { txns, net }]) => ({
      label: dayLabel(date),
      net: `${net >= 0 ? '+' : '−'}${formatMoney(Math.abs(net))}`,
      netPositive: net >= 0,
      transactions: txns,
    }))
}
