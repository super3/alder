import type { Transaction } from '../data'
import { Avatar } from './primitives'

export function TransactionRow({ transaction: t }: { transaction: Transaction }) {
  return (
    <div className="tx-row">
      <Avatar initials={t.initials} bg={t.avatarBg} fg={t.avatarFg} size={36} fontSize={13} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tx-row-name">
          {t.merchant}
          {t.pending && <span className="tx-pending">Pending</span>}
        </div>
        <div className="tx-row-sub">{t.sub}</div>
      </div>
      <span className={`tx-amount${t.positive ? ' positive' : ''}`}>{t.amount}</span>
    </div>
  )
}
