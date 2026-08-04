import type { MenuKey, Transaction } from '../data'
import { Menu, MenuCheckItem } from '../components/menu'
import { TransactionRow } from '../components/TransactionRow'
import { EmptyState } from '../components/EmptyState'
import { SlidersIcon } from '../components/icons'
import type { CashFlow, NetWorthHistory } from '../plaidMapping'
import { NetWorthCard } from '../components/NetWorthCard'

export interface DashCards {
  networth: boolean
  recent: boolean
  cashflow: boolean
}

interface DashboardProps {
  cards: DashCards
  onFlipCard: (key: keyof DashCards) => void
  onViewTransactions: () => void
  netWorth: string | null
  netWorthHistory: NetWorthHistory | null
  menuSel: Record<MenuKey, number>
  onMenuSelect: (key: MenuKey, index: number) => void
  recent: Transaction[] | null
  cashFlow: CashFlow | null
  onAddAccount: () => void
}

export function Dashboard({
  cards,
  onFlipCard,
  onViewTransactions,
  netWorth,
  netWorthHistory,
  menuSel,
  onMenuSelect,
  recent,
  cashFlow,
  onAddAccount,
}: DashboardProps) {
  const connected = netWorth != null

  return (
    <div className="screen">
      <div className="screen-header">
        <span className="screen-title">Dashboard</span>
        <div className="screen-actions">
          {connected && (
            <Menu
              id="customize"
              trigger={
                <div className="btn" style={{ gap: 7 }}>
                  <SlidersIcon />
                  <span>Customize</span>
                </div>
              }
            >
              <div className="menu-section-label">Show on dashboard</div>
              <MenuCheckItem label="Net worth" checked={cards.networth} onToggle={() => onFlipCard('networth')} />
              <MenuCheckItem label="Recent transactions" checked={cards.recent} onToggle={() => onFlipCard('recent')} />
              <MenuCheckItem label="Cash flow" checked={cards.cashflow} onToggle={() => onFlipCard('cashflow')} />
            </Menu>
          )}
        </div>
      </div>
      <div className="screen-body">
        {!connected ? (
          <EmptyState
            title="No accounts connected yet"
            sub="Connect a bank to see your net worth, recent transactions, and cash flow here. Log in first if you haven't."
            actionLabel="+ Add account"
            onAction={onAddAccount}
          />
        ) : (
          <>
            {cards.networth && (
              <NetWorthCard
                netWorth={netWorth}
                history={netWorthHistory}
                menuSel={menuSel}
                onMenuSelect={onMenuSelect}
              />
            )}

            <div
              style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginTop: 16, alignItems: 'start' }}
            >
              {cards.recent && (
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Recent transactions</span>
                    <span className="view-all" onClick={onViewTransactions}>
                      View all →
                    </span>
                  </div>
                  {recent && recent.length > 0 ? (
                    recent.map((t) => <TransactionRow key={t.merchant + t.amount + t.sub} transaction={t} />)
                  ) : (
                    <div style={{ padding: '18px 20px', fontSize: 14, color: 'var(--faint)' }}>
                      No transactions synced yet — they'll appear here shortly after you connect a bank.
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {cards.cashflow && (
                  <div className="card" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="card-title">Cash flow · {cashFlow?.month ?? 'This month'}</span>
                    </div>
                    {cashFlow ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5, marginTop: 14 }}>
                          <span style={{ color: 'var(--muted)' }}>Income</span>
                          <span className="num" style={{ fontWeight: 600 }}>
                            {cashFlow.income}
                          </span>
                        </div>
                        <div
                          style={{ height: 8, borderRadius: 999, background: 'var(--track)', marginTop: 6, overflow: 'hidden' }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: cashFlow.incomeWidth,
                              borderRadius: 999,
                              background: 'oklch(0.62 0.12 160)',
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5, marginTop: 12 }}>
                          <span style={{ color: 'var(--muted)' }}>Spending</span>
                          <span className="num" style={{ fontWeight: 600 }}>
                            {cashFlow.spending}
                          </span>
                        </div>
                        <div
                          style={{ height: 8, borderRadius: 999, background: 'var(--track)', marginTop: 6, overflow: 'hidden' }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: cashFlow.spendingWidth,
                              borderRadius: 999,
                              background: 'var(--bar-mid)',
                            }}
                          />
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderTop: '1px solid var(--divider)',
                            marginTop: 14,
                            paddingTop: 12,
                            fontSize: 14.5,
                          }}
                        >
                          <span style={{ color: 'var(--muted)' }}>Net saved</span>
                          <span
                            className="num"
                            style={{
                              fontWeight: 650,
                              color: cashFlow.netPositive ? 'var(--positive)' : 'oklch(0.5 0.16 25)',
                            }}
                          >
                            {cashFlow.net}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ padding: '14px 0 4px 0', fontSize: 14, color: 'var(--faint)' }}>
                        No transactions this month yet.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
