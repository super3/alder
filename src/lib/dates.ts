// Calendar dates are handled as local YYYY-MM-DD strings throughout. Plaid
// dates are calendar dates, so converting a local midnight through
// toISOString() (UTC) shifts every day by one for anyone east of UTC — which
// is exactly what the net worth chart used to do.

export type TxRange = 'This month' | 'Last month' | 'Last 3 months' | 'Year to date'

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate())
}

// Inclusive bounds for the Transactions screen's range menu.
export function rangeBounds(range: TxRange, now = new Date()): { start: string; end: string } {
  const today = toISODate(now)
  switch (range) {
    case 'Last month':
      return {
        start: toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: toISODate(new Date(now.getFullYear(), now.getMonth(), 0)),
      }
    case 'Last 3 months':
      return { start: toISODate(addMonths(now, -3)), end: today }
    case 'Year to date':
      return { start: toISODate(new Date(now.getFullYear(), 0, 1)), end: today }
    case 'This month':
      return { start: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
  }
}

// "Today · Tue, Aug 4" / "Yesterday · Mon, Aug 3" / "Sun, Aug 2".
export function dayLabel(iso: string, now = new Date()): string {
  const date = parseISODate(iso)
  const diffDays = Math.round((parseISODate(toISODate(now)).getTime() - date.getTime()) / 86_400_000)
  const formatted = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (diffDays === 0) return `Today · ${formatted}`
  if (diffDays === 1) return `Yesterday · ${formatted}`
  return formatted
}

export function shortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// "just now", "5 min ago", "3 hours ago", "2 days ago", else "Jul 4".
export function relativeTime(timestamp: string | null, now = new Date()): string {
  if (!timestamp) return 'never'
  const then = new Date(timestamp)
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
