import { MENUS, type MenuKey } from '../data'
import { SelectMenu } from './menu'
import { NetWorthChart } from './NetWorthChart'
import type { NetWorthHistory } from '../plaidMapping'

interface NetWorthCardProps {
  netWorth: string
  history: NetWorthHistory | null
  menuSel: Record<MenuKey, number>
  onMenuSelect: (key: MenuKey, index: number) => void
  height?: number
}

// One card, rendered identically on the Dashboard and the Accounts screen, so
// the two can never drift in value, label or chart treatment.
export function NetWorthCard({ netWorth, history, menuSel, onMenuSelect, height = 240 }: NetWorthCardProps) {
  return (
    <div className="card" style={{ padding: '22px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div className="overline">Net worth</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="num pv" style={{ fontSize: 38, fontWeight: 650, letterSpacing: '-0.02em' }}>
              {netWorth}
            </span>
            {history?.plottable && (
              <>
                <span
                  className="num pv"
                  style={{
                    fontSize: 15.5,
                    fontWeight: 600,
                    color: history.changePositive ? 'var(--positive)' : 'var(--negative)',
                  }}
                >
                  {history.change}
                </span>
                <span style={{ fontSize: 14, color: 'var(--faint)' }}>{history.changeLabel}</span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <SelectMenu
            id="nwRange"
            options={MENUS.nwRange}
            selected={menuSel.nwRange}
            onSelect={(i) => onMenuSelect('nwRange', i)}
          />
        </div>
      </div>

      {history?.plottable ? (
        <>
          <div style={{ marginTop: 18 }}>
            <NetWorthChart points={history.points} height={height} />
          </div>
          {/* The series is reconstructed from transactions, so say what it omits. */}
          <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--fainter)' }}>
            Reconstructed from your synced transactions — it doesn't include investment market
            movement or activity from before your first synced transaction.
          </div>
        </>
      ) : (
        <div className="chart-placeholder" style={{ height, marginTop: 18 }}>
          Net worth history appears once transactions have synced for this period.
        </div>
      )}
    </div>
  )
}
