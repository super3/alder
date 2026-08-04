import type { Account, AccountGroup, MenuKey } from '../data'
import { Avatar, Sparkline } from '../components/primitives'
import { EmptyState } from '../components/EmptyState'
import { GroupChevron } from '../components/icons'
import type { LiveSummary, NetWorthHistory } from '../plaidMapping'
import { NetWorthCard } from '../components/NetWorthCard'

export type GroupId = AccountGroup['id']

export type RefreshState = 'idle' | 'busy' | 'done'

interface AccountsProps {
  openGroups: Record<GroupId, boolean>
  onToggleGroup: (id: GroupId) => void
  summaryMode: 'totals' | 'percent'
  onSetSummaryMode: (mode: 'totals' | 'percent') => void
  refresh: RefreshState
  onRefresh: () => void
  onOpenAccount: (account: Account) => void
  onAddAccount: () => void
  groups: AccountGroup[] | null
  summary: LiveSummary | null
  netWorthHistory: NetWorthHistory | null
  menuSel: Record<MenuKey, number>
  onMenuSelect: (key: MenuKey, index: number) => void
}

const REFRESH_LABELS: Record<RefreshState, string> = {
  idle: 'Refresh all',
  busy: 'Refreshing…',
  done: 'Updated just now',
}

function AccountRow({ account, onOpen }: { account: Account; onOpen: () => void }) {
  return (
    <div className="acct-row" onClick={onOpen}>
      <Avatar initials={account.initials} bg={account.avatarBg} fg={account.avatarFg} size={38} fontSize={13.5} />
      <div className="acct-row-main">
        <div className="acct-row-name">{account.name}</div>
        <div className="acct-row-sub">{account.institution}</div>
      </div>
      {account.sparkline && <Sparkline points={account.sparkline} />}
      <div className="acct-row-right pv">
        <div className="acct-row-balance">{account.balance}</div>
        <div className="acct-row-updated">{account.updated}</div>
      </div>
    </div>
  )
}

interface SummarySectionProps {
  title: string
  total: string
  segments: { label: string; width: string; color: string; amount: string; percent: string }[]
  percentMode: boolean
}

function SummarySection({ title, total, segments, percentMode }: SummarySectionProps) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 15, fontWeight: 650 }}>{title}</span>
        <span className="num pv" style={{ fontSize: 15.5, fontWeight: 650 }}>
          {total}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 2, height: 10, borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
        {segments.map((seg) => (
          <div key={seg.label} style={{ width: seg.width, background: seg.color }} />
        ))}
      </div>
      {segments.map((seg, i) => (
        <div
          key={seg.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: i === 0 ? 12 : 10,
            fontSize: 14,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: seg.color }} />
            {seg.label}
          </span>
          <span className="num pv" style={{ fontWeight: 600 }}>
            {percentMode ? seg.percent : seg.amount}
          </span>
        </div>
      ))}
    </>
  )
}

export function Accounts({
  openGroups,
  onToggleGroup,
  summaryMode,
  onSetSummaryMode,
  refresh,
  onRefresh,
  onOpenAccount,
  onAddAccount,
  groups,
  summary,
  netWorthHistory,
  menuSel,
  onMenuSelect,
}: AccountsProps) {
  const percentMode = summaryMode === 'percent'
  const connected = Boolean(groups && groups.length > 0)

  return (
    <div className="screen">
      <div className="screen-header">
        <span className="screen-title">Accounts</span>
        <div className="screen-actions">
          {connected && (
            <div className="btn" onClick={onRefresh}>
              ↻ <span>{REFRESH_LABELS[refresh]}</span>
            </div>
          )}
          <div className="btn-primary" onClick={onAddAccount}>
            + <span>Add account</span>
          </div>
        </div>
      </div>
      <div className="screen-body">
        {!connected || !summary ? (
          <EmptyState
            title="No accounts connected yet"
            sub="Connect a bank to see balances, account groups, and your asset and liability breakdown. Log in first if you haven't."
            actionLabel="+ Add account"
            onAction={onAddAccount}
          />
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <NetWorthCard
                netWorth={summary.netWorth}
                history={netWorthHistory}
                menuSel={menuSel}
                onMenuSelect={onMenuSelect}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {groups!.map((group) => (
                  <div key={group.id} className="card">
                    <div className="acct-group-header" onClick={() => onToggleGroup(group.id)}>
                      <GroupChevron open={openGroups[group.id]} />
                      <span className="acct-group-title">{group.label}</span>
                      {group.change && <span className="acct-group-change">{group.change}</span>}
                      <span className="acct-group-note">{group.changeNote}</span>
                      <span className="acct-group-total pv">{group.total}</span>
                    </div>
                    {openGroups[group.id] &&
                      group.accounts.map((account) => (
                        <AccountRow key={account.id} account={account} onOpen={() => onOpenAccount(account)} />
                      ))}
                  </div>
                ))}
              </div>

              <div
                className="card"
                style={{ flex: '1 1 260px', maxWidth: 360, minWidth: 250, padding: '18px 20px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="card-title">Summary</span>
                  <div className="seg">
                    <span
                      className={`seg-item${percentMode ? '' : ' active'}`}
                      onClick={() => onSetSummaryMode('totals')}
                    >
                      Totals
                    </span>
                    <span
                      className={`seg-item${percentMode ? ' active' : ''}`}
                      onClick={() => onSetSummaryMode('percent')}
                    >
                      Percent
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 18 }}>
                  <SummarySection
                    title="Assets"
                    total={summary.assets.total}
                    segments={summary.assets.segments}
                    percentMode={percentMode}
                  />
                </div>

                <div style={{ borderTop: '1px solid var(--divider)', marginTop: 18, paddingTop: 16 }}>
                  <SummarySection
                    title="Liabilities"
                    total={summary.liabilities.total}
                    segments={summary.liabilities.segments}
                    percentMode={percentMode}
                  />
                </div>

                <div
                  style={{
                    borderTop: '1px solid var(--divider)',
                    marginTop: 18,
                    paddingTop: 16,
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 650 }}>Net worth</span>
                  <span className="num pv" style={{ fontSize: 15.5, fontWeight: 650, color: 'var(--positive)' }}>
                    {summary.netWorth}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
