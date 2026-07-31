import { MENUS, type MenuKey, type Transaction, type TransactionDay } from '../data'
import { Menu, MenuCheckItem, MenuOption } from '../components/menu'
import { Avatar } from '../components/primitives'
import { EmptyState } from '../components/EmptyState'
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
}

function TransactionListRow({ transaction: t }: { transaction: Transaction }) {
  return (
    <div className="tx-grid-row">
      <div className="tx-grid-merchant">
        <Avatar initials={t.initials} bg={t.avatarBg} fg={t.avatarFg} size={34} fontSize={12.5} />
        <span className="tx-grid-name">{t.merchant}</span>
      </div>
      <div className="tx-grid-category">
        <span className="tx-grid-emoji">{t.category.emoji}</span>
        <span className="tx-grid-truncate">{t.category.name}</span>
      </div>
      <div className="tx-grid-account">
        {t.account && (
          <>
            <Avatar
              initials={t.account.initials}
              bg={t.account.avatarBg}
              fg={t.account.avatarFg}
              size={20}
              fontSize={9}
            />
            <span className="tx-grid-truncate">{t.account.name}</span>
          </>
        )}
      </div>
      <span className={`tx-grid-amount${t.positive ? ' positive' : ''}`}>{t.amount}</span>
    </div>
  )
}

export function Transactions({
  menuSel,
  onMenuSelect,
  filters,
  onFlipFilter,
  onAddAccount,
  days,
  count,
}: TransactionsProps) {
  const connected = Boolean(days && days.length > 0)
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
                {count} transactions synced
              </span>
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
              {days!.map((day) => (
                <div key={day.label}>
                  <div className="day-header-row">
                    <span className="day-header-label">{day.label}</span>
                    <span className={`day-header-net num${day.netPositive ? ' positive' : ''}`}>{day.net}</span>
                  </div>
                  {day.transactions.map((t) => (
                    <TransactionListRow key={t.merchant + t.amount + t.sub} transaction={t} />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
