// Maps live Plaid API data into the typed shapes the screens render. Pure
// functions only — anything time-dependent takes `now` so it can be tested.
import type { DailyTotal, PlaidAccount, PlaidItem, PlaidTransaction } from './api'
import {
  CATEGORIES,
  type Account,
  type AccountGroup,
  type Category,
  type Institution,
  type Transaction,
  type TransactionDay,
} from './data'
import { addDays, addMonths, dayLabel, parseISODate, relativeTime, shortDate, toISODate } from './lib/dates'

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

export function formatMoney(value: number | null, currency: string | null = 'USD'): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value)
}

function signedMoney(value: number, currency: string | null = 'USD'): string {
  return `${value >= 0 ? '+' : '−'}${formatMoney(Math.abs(value), currency)}`
}

// ---------------------------------------------------------------- accounts

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

const groupOf = (account: PlaidAccount) => GROUP_FOR_TYPE[account.type] || 'property'
const isLiability = (group: AccountGroup['id']) => group === 'credit' || group === 'loans'

function toAccount(account: PlaidAccount, now: Date): Account {
  const label = account.institution_name || account.name
  const { bg, fg } = avatarFor(label)
  const kind = account.subtype || account.type
  return {
    id: account.account_id,
    name: account.name + (account.mask ? ` ·· ${account.mask}` : ''),
    institution: `${account.institution_name || 'Connected'} · ${kind.charAt(0).toUpperCase()}${kind.slice(1)}`,
    balance: formatMoney(account.balances.current, account.balances.iso_currency_code),
    initials: initialsOf(label),
    avatarBg: bg,
    avatarFg: fg,
    updated: relativeTime(account.balances_updated_at, now),
    stale: account.stale,
  }
}

export function mapAccountsToGroups(accounts: PlaidAccount[], now = new Date()): AccountGroup[] {
  const byGroup = new Map<AccountGroup['id'], { accounts: Account[]; total: number }>()
  for (const account of accounts) {
    const id = groupOf(account)
    const entry = byGroup.get(id) || { accounts: [], total: 0 }
    entry.accounts.push(toAccount(account, now))
    entry.total += account.balances.current ?? 0
    byGroup.set(id, entry)
  }
  const order: AccountGroup['id'][] = ['cash', 'credit', 'invest', 'property', 'loans']
  return order
    .filter((id) => byGroup.has(id))
    .map((id) => ({
      id,
      label: GROUP_LABELS[id],
      total: formatMoney(byGroup.get(id)!.total),
      accounts: byGroup.get(id)!.accounts,
    }))
}

export interface Segment {
  label: string
  width: string
  color: string
  amount: string
  percent: string
}

export interface LiveSummary {
  assets: { total: string; segments: Segment[] }
  liabilities: { total: string; segments: Segment[] }
  netWorth: string
}

const SEGMENT_COLORS: Record<string, string> = {
  Investments: 'oklch(0.62 0.12 165)',
  Cash: 'oklch(0.62 0.12 85)',
  Property: 'oklch(0.62 0.12 250)',
  Loans: 'oklch(0.62 0.12 300)',
  'Credit cards': 'oklch(0.62 0.12 330)',
}

function buildSegments(parts: { label: string; amount: number }[]): Segment[] {
  const total = parts.reduce((sum, part) => sum + part.amount, 0)
  return parts
    .filter((part) => part.amount > 0)
    .map((part) => {
      const pct = (part.amount / total) * 100
      return {
        label: part.label,
        width: `${pct.toFixed(1)}%`,
        color: SEGMENT_COLORS[part.label],
        amount: formatMoney(part.amount),
        percent: `${pct.toFixed(1)}%`,
      }
    })
}

/** Assets minus liabilities (credit and loan balances are amounts owed). */
export function netWorthOf(accounts: PlaidAccount[]): number {
  return accounts.reduce((sum, account) => {
    const balance = account.balances.current ?? 0
    return sum + (isLiability(groupOf(account)) ? -balance : balance)
  }, 0)
}

export function buildLiveSummary(accounts: PlaidAccount[]): LiveSummary {
  const sums: Record<string, number> = {}
  for (const account of accounts) {
    const label = GROUP_LABELS[groupOf(account)]
    sums[label] = (sums[label] || 0) + (account.balances.current ?? 0)
  }
  const part = (label: string) => ({ label, amount: sums[label] || 0 })
  const assetParts = ['Investments', 'Cash', 'Property'].map(part)
  const liabilityParts = ['Loans', 'Credit cards'].map(part)
  const assetTotal = assetParts.reduce((sum, p) => sum + p.amount, 0)
  const liabilityTotal = liabilityParts.reduce((sum, p) => sum + p.amount, 0)
  return {
    assets: { total: formatMoney(assetTotal), segments: buildSegments(assetParts) },
    liabilities: { total: formatMoney(liabilityTotal), segments: buildSegments(liabilityParts) },
    netWorth: formatMoney(netWorthOf(accounts)),
  }
}

// One row per connection, keyed by Plaid item — two logins at the same bank
// are two rows, each separately reconnectable and disconnectable.
export function mapItemsToInstitutions(
  items: PlaidItem[],
  accounts: PlaidAccount[],
  now = new Date(),
): Institution[] {
  return items.map((item) => {
    const name = item.institution_name || 'Connected bank'
    const count = accounts.filter((a) => a.item_id === item.item_id).length
    const { bg, fg } = avatarFor(name)
    return {
      itemId: item.item_id,
      name,
      sub: `${count} account${count === 1 ? '' : 's'} · Plaid`,
      initials: initialsOf(name),
      avatarBg: bg,
      avatarFg: fg,
      status: item.status,
      lastSynced: relativeTime(item.last_synced_at, now),
    }
  })
}

// ------------------------------------------------------------ transactions

// Plaid personal_finance_category.primary -> the design's categories.
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
export function categoryFor(pfc: string | null, override: string | null): Category {
  if (override) {
    const known = Object.values(CATEGORIES).find((c) => c.name === override)
    return known ?? { ...CATEGORIES.transfer, name: override, emoji: '🏷️' }
  }
  return (pfc && CATEGORY_FOR_PFC[pfc]) || CATEGORIES.transfer
}

// Must match the server's TRANSFER_PREDICATE (server/src/db.js), which drives
// the "Include transfers" filter and keeps transfers out of cash flow.
export function isTransfer(pfc: string | null, override: string | null): boolean {
  return override ? override === 'Transfer' : (pfc ?? '').startsWith('TRANSFER')
}

/** Plaid amounts are positive for money out; flip to a natural sign. */
export function signedAmount(txn: Pick<PlaidTransaction, 'amount'>): number {
  return -Number(txn.amount)
}

export function toTransaction(txn: PlaidTransaction): Transaction {
  const amountValue = signedAmount(txn)
  const plaidMerchant = txn.merchant_name || txn.name
  // A saved edit wins over whatever Plaid supplied.
  const merchant = txn.override_merchant_name || plaidMerchant
  const category = categoryFor(txn.personal_finance_category, txn.override_category)
  const date = txn.date.slice(0, 10)
  const accountName = txn.account_name || txn.institution_name || 'Connected account'
  const merchantAvatar = avatarFor(merchant)
  const accountAvatar = avatarFor(accountName)
  return {
    id: txn.transaction_id,
    date,
    merchant,
    plaidMerchant,
    statementName: txn.name,
    pending: txn.pending,
    amountValue,
    amount: signedMoney(amountValue, txn.iso_currency_code),
    positive: amountValue > 0,
    category,
    isTransfer: isTransfer(txn.personal_finance_category, txn.override_category),
    merchantEdited: Boolean(txn.override_merchant_name),
    categoryEdited: Boolean(txn.override_category),
    sub: `${shortDate(date)} · ${category.name}`,
    initials: initialsOf(merchant),
    avatarBg: merchantAvatar.bg,
    avatarFg: merchantAvatar.fg,
    account: {
      id: txn.account_id,
      name: accountName,
      initials: initialsOf(accountName),
      avatarBg: accountAvatar.bg,
      avatarFg: accountAvatar.fg,
    },
  }
}

// Groups an already date-ordered list (most recent first) into days.
export function groupByDay(transactions: Transaction[], now = new Date()): TransactionDay[] {
  const days: TransactionDay[] = []
  const nets = new Map<string, number>()
  for (const txn of transactions) {
    let day = days[days.length - 1]
    if (!day || day.date !== txn.date) {
      day = { date: txn.date, label: dayLabel(txn.date, now), net: '', netPositive: true, transactions: [] }
      days.push(day)
    }
    day.transactions.push(txn)
    nets.set(txn.date, (nets.get(txn.date) || 0) + txn.amountValue)
  }
  for (const day of days) {
    const net = nets.get(day.date)!
    day.net = signedMoney(net)
    day.netPositive = net >= 0
  }
  return days
}

// ------------------------------------------------------ aggregates (daily)

export interface CashFlow {
  month: string
  income: string
  spending: string
  net: string
  netPositive: boolean
  incomeWidth: string
  spendingWidth: string
}

// Income vs. spending for the current calendar month, from the server's daily
// totals (transfers already excluded there), so it covers every transaction.
export function buildCashFlow(days: DailyTotal[], now = new Date()): CashFlow {
  const monthStart = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
  let income = 0
  let spending = 0
  for (const day of days) {
    if (day.date < monthStart) continue
    income += day.income
    spending += day.spending
  }
  const max = Math.max(income, spending)
  const net = income - spending
  const width = (value: number) => (max > 0 ? `${Math.round((value / max) * 100)}%` : '0%')
  return {
    month: now.toLocaleDateString('en-US', { month: 'long' }),
    income: formatMoney(income),
    spending: formatMoney(spending),
    net: signedMoney(net),
    netPositive: net >= 0,
    incomeWidth: width(income),
    spendingWidth: width(spending),
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
  /** True once there are at least two distinct values to draw a line between. */
  plottable: boolean
}

export const RANGE_MONTHS: Record<string, number> = {
  '1 month': 1,
  '3 months': 3,
  '6 months': 6,
  '1 year': 12,
}

// Reconstructs net worth backwards from today using the server's daily nets.
//
// Every transaction moves net worth by exactly its signed amount, for assets
// and liabilities alike: a $100 card purchase is -100 (owed goes up), and
// paying that card from checking is -100 on checking and +100 on the card,
// which correctly nets to zero when both accounts are connected. So
// netWorth(T) = netWorth(now) - sum of daily nets after T.
//
// The daily totals cover every synced transaction in range (previously this
// walked one 200-row page and went flat past it). What it still can't see is
// investment market movement, or anything before the earliest sync.
export function buildNetWorthHistory(
  accounts: PlaidAccount[],
  days: DailyTotal[],
  range: string,
  now = new Date(),
): NetWorthHistory {
  const current = netWorthOf(accounts)
  const today = parseISODate(toISODate(now))
  const start = toISODate(addMonths(today, -(RANGE_MONTHS[range] ?? 1)))

  const netByDay = new Map(days.map((day) => [day.date, day.net]))
  const points: NetWorthPoint[] = []
  let running = current
  // Calendar steps, not 24h ones: a fixed 86,400,000 ms step skips a day at
  // the spring DST change.
  for (let cursor = today; toISODate(cursor) >= start; cursor = addDays(cursor, -1)) {
    const day = toISODate(cursor)
    points.unshift({ date: day, value: running })
    running -= netByDay.get(day) || 0
  }

  const delta = current - points[0].value
  return {
    points,
    current,
    change: `${delta >= 0 ? '↑' : '↓'} ${formatMoney(Math.abs(delta))}`,
    changePositive: delta >= 0,
    changeLabel: `${range} change`,
    plottable: new Set(points.map((p) => p.value)).size > 1,
  }
}
