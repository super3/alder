import { useId } from 'react'
import type { NetWorthPoint } from '../plaidMapping'

const VIEW_W = 1040
const PAD_TOP = 12
const PAD_BOTTOM = 12

function niceTicks(min: number, max: number, count = 5): number[] {
  if (max === min) return [min]
  const rawStep = (max - min) / (count - 1)
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rawStep) || 1))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? magnitude * 10
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step / 2; v += step) ticks.push(v)
  return ticks
}

function abbreviate(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`
  return `${sign}$${Math.round(abs)}`
}

function xLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface NetWorthChartProps {
  points: NetWorthPoint[]
  height?: number
}

export function NetWorthChart({ points, height = 240 }: NetWorthChartProps) {
  // useId keeps the gradient unique when two charts share a page.
  const gradientId = `nwfill-${useId().replace(/:/g, '')}`

  const values = points.map((p) => p.value)
  const ticks = niceTicks(Math.min(...values), Math.max(...values))
  const min = Math.min(...values, ticks[0])
  const max = Math.max(...values, ticks[ticks.length - 1])
  const span = max - min || 1

  const plotH = height - PAD_TOP - PAD_BOTTOM
  const x = (i: number) => (points.length === 1 ? VIEW_W : (i / (points.length - 1)) * VIEW_W)
  const y = (value: number) => PAD_TOP + (1 - (value - min) / span) * plotH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')
  const area = `${line} L${VIEW_W},${height} L0,${height} Z`
  const last = points[points.length - 1]

  // Up to 6 evenly spaced date labels, always including both ends.
  const labelStep = Math.max(1, Math.floor((points.length - 1) / Math.max(1, Math.min(6, points.length) - 1)))
  const labels = points.filter((_, i) => i % labelStep === 0 || i === points.length - 1)

  return (
    <div className="nw-chart">
      <div className="nw-chart-y">
        {ticks.map((tick) => (
          <div key={tick} className="nw-chart-y-label" style={{ top: y(tick) - 7 }}>
            {abbreviate(tick)}
          </div>
        ))}
      </div>
      <div className="nw-chart-plot">
        <div className="nw-chart-svg" style={{ height }}>
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${VIEW_W} ${height}`}
            preserveAspectRatio="none"
            style={{ display: 'block' }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-fill-from)" />
                <stop offset="100%" stopColor="var(--chart-fill-to)" />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <line key={tick} x1="0" y1={y(tick)} x2={VIEW_W} y2={y(tick)} stroke="var(--grid)" strokeWidth="1" />
            ))}
            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={line}
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="nw-chart-dot" style={{ top: y(last.value) - 5 }} />
        </div>
        <div className="nw-chart-x">
          {labels.map((p) => (
            <span key={p.date}>{xLabel(p.date)}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
