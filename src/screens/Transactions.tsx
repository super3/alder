import { useMemo, useState } from 'react'
import { MENUS } from '../data'
import { Menu, MenuCheckItem, MenuOption } from '../components/menu'
import { EmptyState } from '../components/EmptyState'
import { EditableTransactionRow } from '../components/EditableTransactionRow'
import type { CategoryGroup } from '../categories'
import type { OverridePatch } from '../api'
import { CalendarIcon, FilterIcon } from '../components/icons'
import { groupByDay, toTransaction } from '../plaidMapping'
import { useTransactionsPage, type TxFilters } from '../hooks/useTransactionsPage'

interface TransactionsProps {
  hasAccounts: boolean
  version: number
  categoryGroups: CategoryGroup[]
  saveOverride: (transactionId: string, patch: OverridePatch) => Promise<void>
  onError: (message: string) => void
  onAddAccount: () => void
  onOpenAccount: (accountId: string) => void
}

export function Transactions({
  hasAccounts,
  version,
  categoryGroups,
  saveOverride,
  onError,
  onAddAccount,
  onOpenAccount,
}: TransactionsProps) {
  const [rangeIndex, setRangeIndex] = useState(0)
  const [filters, setFilters] = useState<TxFilters>({ pending: false, income: false, transfers: true })
  const range = MENUS.txDate[rangeIndex]
  const page = useTransactionsPage(range, filters, version, saveOverride, onError)
  const days = useMemo(() => groupByDay((page.rows ?? []).map(toTransaction)), [page.rows])
  const shown = page.rows?.length ?? 0
  const flip = (key: keyof TxFilters) => setFilters((f) => ({ ...f, [key]: !f[key] }))

  return (
    <div className="screen">
      <div className="screen-header">
        <span className="screen-title">Transactions</span>
        {hasAccounts && (
          <div className="screen-actions">
            <Menu
              id="txDate"
              trigger={
                <div className="btn-toolbar">
                  <CalendarIcon />
                  <span>{range}</span>
                </div>
              }
            >
              {MENUS.txDate.map((opt, i) => (
                <MenuOption key={opt} label={opt} onSelect={() => setRangeIndex(i)} />
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
              <MenuCheckItem label="Pending only" checked={filters.pending} onToggle={() => flip('pending')} />
              <MenuCheckItem label="Income only" checked={filters.income} onToggle={() => flip('income')} />
              <MenuCheckItem label="Include transfers" checked={filters.transfers} onToggle={() => flip('transfers')} />
            </Menu>
          </div>
        )}
      </div>
      <div className="screen-body">
        {!hasAccounts ? (
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
                {page.rows == null
                  ? 'Loading…'
                  : page.hasMore
                    ? `Showing ${shown} of ${page.total} transactions`
                    : `${page.total} transaction${page.total === 1 ? '' : 's'}`}
              </span>
            </div>

            {page.rows != null && days.length === 0 ? (
              <div className="card" style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--faint)' }}>
                No transactions in this period match these filters.
              </div>
            ) : (
              <div className="card tx-card">
                {days.map((day) => (
                  <div key={day.date}>
                    <div className="day-header-row">
                      <span className="day-header-label">{day.label}</span>
                      <span className={`day-header-net num${day.netPositive ? ' positive' : ''}`}>{day.net}</span>
                    </div>
                    {day.transactions.map((t) => (
                      <EditableTransactionRow
                        key={t.id}
                        transaction={t}
                        categoryGroups={categoryGroups}
                        onEdit={page.edit}
                        onOpenAccount={onOpenAccount}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {page.hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                <div className="btn" onClick={page.loading ? undefined : page.loadMore}>
                  {page.loading ? 'Loading…' : 'Load more'}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
