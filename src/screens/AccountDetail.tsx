import type { Account, Transaction } from '../data'
import { Avatar } from '../components/primitives'
import { TransactionRow } from '../components/TransactionRow'

interface AccountDetailProps {
  account: Account
  activity: Transaction[]
  onBack: () => void
  onViewTransactions: () => void
}

export function AccountDetail({ account, activity, onBack, onViewTransactions }: AccountDetailProps) {
  return (
    <div className="screen">
      <div className="screen-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="back-btn" onClick={onBack}>
            ‹
          </div>
          <span style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--faint)', cursor: 'pointer' }} onClick={onBack}>
            Accounts
          </span>
          <span style={{ fontSize: 14.5, color: '#C9C6BC' }}>/</span>
          <span className="screen-title">{account.name}</span>
        </div>
      </div>
      <div className="screen-body">
        <div className="card" style={{ padding: '22px 26px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Avatar initials={account.initials} bg={account.avatarBg} fg={account.avatarFg} size={44} fontSize={15} />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 19, fontWeight: 650 }}>{account.name}</div>
              <div style={{ fontSize: 14, color: 'var(--faint)', marginTop: 2 }}>{account.institution}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="num pv" style={{ fontSize: 30, fontWeight: 650, letterSpacing: '-0.02em' }}>
                {account.balance}
              </div>
              <div style={{ fontSize: 13, color: 'var(--fainter)', marginTop: 2 }}>Updated {account.updated}</div>
            </div>
          </div>
          <div className="chart-placeholder" style={{ height: 140, marginTop: 20 }}>
            Balance history will build up as this account syncs.
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent activity</span>
            <span className="view-all" onClick={onViewTransactions}>
              View all →
            </span>
          </div>
          {activity.length > 0 ? (
            activity.map((t) => <TransactionRow key={t.merchant + t.amount + t.sub} transaction={t} />)
          ) : (
            <div style={{ padding: '18px 20px', fontSize: 14, color: 'var(--faint)' }}>
              No activity synced for this account yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
