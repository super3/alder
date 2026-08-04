import { MENUS, type MenuKey, type TransactionDay } from '../data'
import { Menu, MenuCheckItem, MenuOption } from '../components/menu'
import { EmptyState } from '../components/EmptyState'
import { EditableTransactionRow } from '../components/EditableTransactionRow'
import type { CategoryGroup } from '../categories'
import { CalendarIcon, FilterIcon } from '../components/icons'

export interface TxFilters {
  pending: boolean
  income: boolean
  transfers: boolean
}

interface TransactionsProps {
  menuSel: Record<MenuKey, number>
  onMenuSelect: (key: MenuKey, index: number) => void
  filters: TxFilters
  onFlipFilter: (key: keyof TxFilters) => void
  onAddAccount: () => void
  days: TransactionDay[] | null
  count: number
  categoryGroups: CategoryGroup[]
  onRenameMerchant: (transactionId: string, name: string | null) => void
  onSetCategory: (transactionId: string, category: string | null) => void
  onOpenAccount: (accountId: string) => void
}

// Days carry a "Today · Sat, Jul 12"-style label, so the range is applied to
// the parsed date embedded in each transaction's day rather than re-deriving.
function withinRange(label: string, range: string): boolean {
  const parsed = Date.parse(`${label.split('·').pop()!.trim()} ${new Date().getFullYear()}`)
  if (Number.isNaN(parsed)) return true
  const date = new Date(parsed)
  const now = new Date()
  if (date > now) date.setFullYear(date.getFullYear() - 1)
  switch (range) {
    case 'Last month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return date >= start && date <= end
    }
    case 'Last 3 months': {
      const start = new Date(now)
      start.setMonth(start.getMonth() - 3)
      return date >= start
    }
    case 'Year to date':
      return date.getFullYear() === now.getFullYear()
    case 'This month':
    default:
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
  }
}

function applyFilters(
  days: TransactionDay[] | null,
  filters: TxFilters,
  rangeIndex: number,
): TransactionDay[] {
  if (!days) return []
  const range = MENUS.txDate[rangeIndex]
  return days
    .filter((day) => withinRange(day.label, range))
    .map((day) => ({
      ...day,
      transactions: day.transactions.filter((t) => {
        if (filters.pending && !t.merchant.includes('(pending)')) return false
        if (filters.income && !t.positive) return false
        if (!filters.transfers && t.category.name === 'Transfer') return false
        return true
      }),
    }))
    .filter((day) => day.transactions.length > 0)
}

export function Transactions({
  menuSel,
  onMenuSelect,
  filters,
  onFlipFilter,
  onAddAccount,
  days,
  count,
  categoryGroups,
  onRenameMerchant,
  onSetCategory,
  onOpenAccount,
}: TransactionsProps) {
  const connected = Boolean(days && days.length > 0)
  const visible = applyFilters(days, filters, menuSel.txDate)
  const shown = visible.reduce((n, day) => n + day.transactions.length, 0)
  return (
    <div className="screen">
      <div className="screen-header">
        <span className="screen-title">Transactions</span>
        {connected && (
          <div className="screen-actions">
            <Menu
              id="txDate"
              trigger={
                <div className="btn-toolbar">
                  <CalendarIcon />
                  <span>{MENUS.txDate[menuSel.txDate]}</span>
                </div>
              }
            >
              {MENUS.txDate.map((opt, i) => (
                <MenuOption key={opt} label={opt} onSelect={() => onMenuSelect('txDate', i)} />
              ))}
            </Menu>
            <Menu
              id="txFilters"
              trigger={
                <div className="btn-toolbar">
                  <FilterIcon />
                  <span>Filters</span>
                </div>
              }
            >
              <MenuCheckItem label="Pending only" checked={filters.pending} onToggle={() => onFlipFilter('pending')} />
              <MenuCheckItem label="Income only" checked={filters.income} onToggle={() => onFlipFilter('income')} />
              <MenuCheckItem
                label="Include transfers"
                checked={filters.transfers}
                onToggle={() => onFlipFilter('transfers')}
              />
            </Menu>
          </div>
        )}
      </div>
      <div className="screen-body">
        {!connected ? (
          <EmptyState
            title="No transactions yet"
            sub="Transactions sync automatically once you connect a bank from the Accounts screen."
            actionLabel="+ Add account"
            onAction={onAddAccount}
          />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <span className="num" style={{ fontSize: 14, color: 'var(--muted)' }}>
                {shown === count ? `${count} transactions synced` : `${shown} of ${count} transactions`}
              </span>
            </div>

            {visible.length === 0 ? (
              <div className="card" style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--faint)' }}>
                No transactions match these filters.
              </div>
            ) : (
              <div className="card tx-card">
                {visible.map((day) => (
                  <div key={day.label}>
                    <div className="day-header-row">
                      <span className="day-header-label">{day.label}</span>
                      <span className={`day-header-net num${day.netPositive ? ' positive' : ''}`}>{day.net}</span>
                    </div>
                    {day.transactions.map((t) => (
                      <EditableTransactionRow
                        key={t.id ?? t.merchant + t.amount + t.sub}
                        transaction={t}
                        categoryGroups={categoryGroups}
                        onRenameMerchant={onRenameMerchant}
                        onSetCategory={onSetCategory}
                        onOpenAccount={onOpenAccount}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
