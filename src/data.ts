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
  updated: string
  sparkline?: string
}

export interface AccountGroup {
  id: 'cash' | 'credit' | 'invest' | 'property' | 'loans'
  label: string
  change?: string
  changeNote: string
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

export interface Transaction {
  merchant: string
  sub: string
  category: Category
  amount: string
  positive?: boolean
  initials: string
  avatarBg: string
  avatarFg: string
  // The transactions grid shows the owning account as its own column, with a
  // small avatar; the dashboard's compact rows only use `sub`.
  account?: {
    name: string
    initials: string
    avatarBg: string
    avatarFg: string
  }
}

export interface TransactionDay {
  label: string
  // Signed net for the day, rendered beside the day label.
  net: string
  netPositive: boolean
  transactions: Transaction[]
}

export interface Institution {
  name: string
  sub: string
  initials: string
  avatarBg: string
  avatarFg: string
  status: 'connected' | 'reconnect'
}

export const MENUS = {
  txDate: ['This month', 'Last month', 'Last 3 months', 'Year to date'],
  nwRange: ['1 month', '3 months', '6 months', '1 year'],
} as const

export type MenuKey = keyof typeof MENUS
