import type { ItemStatus } from './api'

export type Screen = 'dashboard' | 'accounts' | 'accountDetail' | 'transactions' | 'settings'

export type ModalKind = 'addAccount'

export type SettingsSection = 'general' | 'categories' | 'notifications' | 'security' | 'connected'

export interface Account {
  id: string
  name: string
  institution: string
  balance: string
  initials: string
  avatarBg: string
  avatarFg: string
  /** "3 hours ago" — from when the bank last answered, not when we rendered. */
  updated: string
  /** Balances are last-known values because the bank couldn't be reached. */
  stale: boolean
}

export interface AccountGroup {
  id: 'cash' | 'credit' | 'invest' | 'property' | 'loans'
  label: string
  total: string
  accounts: Account[]
}

export interface Category {
  name: string
  emoji: string
  bg: string
  fg: string
}

// The transaction list shows emoji + name; the bg/fg pair is still used where
// a category renders as a pill.
export const CATEGORIES: Record<string, Category> = {
  groceries: { name: 'Groceries', emoji: '🛒', bg: 'oklch(0.95 0.04 145)', fg: 'oklch(0.42 0.09 145)' },
  dining: { name: 'Dining out', emoji: '🍽️', bg: 'oklch(0.95 0.05 45)', fg: 'oklch(0.45 0.1 45)' },
  income: { name: 'Income', emoji: '💵', bg: 'oklch(0.95 0.04 165)', fg: 'oklch(0.4 0.09 165)' },
  transport: { name: 'Transport', emoji: '🚌', bg: 'oklch(0.95 0.04 250)', fg: 'oklch(0.42 0.09 250)' },
  entertainment: { name: 'Entertainment', emoji: '🎬', bg: 'oklch(0.95 0.05 330)', fg: 'oklch(0.44 0.1 330)' },
  shopping: { name: 'Shopping', emoji: '🛍️', bg: 'oklch(0.95 0.05 25)', fg: 'oklch(0.45 0.11 25)' },
  utilities: { name: 'Utilities', emoji: '💡', bg: 'oklch(0.95 0.04 210)', fg: 'oklch(0.42 0.08 210)' },
  transfer: { name: 'Transfer', emoji: '🔁', bg: '#F0EEE8', fg: '#5B5F56' },
}

// The typed view of one transaction. Logic (filters, edits, grouping) reads
// the typed fields; only the formatted ones are for display. The merchant name
// never carries a "(pending)" suffix — that's what `pending` is for.
export interface Transaction {
  id: string
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  merchant: string
  /** Plaid's cleaned merchant name, offered when reverting an edit. */
  plaidMerchant: string
  /** The raw statement descriptor, offered as an alternative name. */
  statementName: string
  pending: boolean
  /** Signed: money in is positive. */
  amountValue: number
  amount: string
  positive: boolean
  category: Category
  isTransfer: boolean
  merchantEdited: boolean
  categoryEdited: boolean
  /** Compact second line for the dashboard: "Jul 12 · Groceries". */
  sub: string
  initials: string
  avatarBg: string
  avatarFg: string
  account: {
    id: string
    name: string
    initials: string
    avatarBg: string
    avatarFg: string
  }
}

export interface TransactionDay {
  date: string
  label: string
  // Signed net for the day, rendered beside the day label.
  net: string
  netPositive: boolean
  transactions: Transaction[]
}

export interface Institution {
  itemId: string
  name: string
  sub: string
  initials: string
  avatarBg: string
  avatarFg: string
  status: ItemStatus
  lastSynced: string
}

export const MENUS = {
  txDate: ['This month', 'Last month', 'Last 3 months', 'Year to date'],
  nwRange: ['1 month', '3 months', '6 months', '1 year'],
} as const

export type MenuKey = keyof typeof MENUS
