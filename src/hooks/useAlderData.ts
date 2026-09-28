import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api,
  type DailyTotal,
  type OverridePatch,
  type PlaidAccount,
  type PlaidItem,
  type PlaidTransaction,
  type SyncResult,
} from '../api'

export interface AlderData {
  accounts: PlaidAccount[] | null
  items: PlaidItem[]
  /** Per-day totals for the last year, computed server-side over everything synced. */
  daily: DailyTotal[]
  recent: PlaidTransaction[] | null
  loading: boolean
  loadError: string | null
  /** Bumps when synced data changes, so screens with their own queries refetch. */
  version: number
  reload: () => Promise<void>
  /** Reload now, and again once the server's first sync has had time to land. */
  afterBankConnected: () => void
  syncAll: () => Promise<SyncResult[]>
  disconnect: (itemId: string) => Promise<void>
  saveOverride: (transactionId: string, patch: OverridePatch) => Promise<void>
}

function describeLoadError(err: Error): string {
  return err.message === 'Not signed in'
    ? 'Log in to see your accounts.'
    : "Couldn't reach the Alder API. Your data is safe — this is a connection problem."
}

export function useAlderData(signedIn: boolean): AlderData {
  const [accounts, setAccounts] = useState<PlaidAccount[] | null>(null)
  const [items, setItems] = useState<PlaidItem[]>([])
  const [daily, setDaily] = useState<DailyTotal[]>([])
  const [recent, setRecent] = useState<PlaidTransaction[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  // Only the newest request of each kind may write state. Without this, two
  // quick edits (or a reload racing a sync) could land out of order and an
  // older response would overwrite a newer one.
  const latestLoad = useRef(0)
  const latestAggregates = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const refreshAggregates = useCallback(async () => {
    const id = ++latestAggregates.current
    const [dailyRes, recentRes] = await Promise.all([api.getDailyTotals(), api.getTransactions({ limit: 5 })])
    if (id !== latestAggregates.current) return
    setDaily(dailyRes.days)
    setRecent(recentRes.transactions)
  }, [])

  const reload = useCallback(async () => {
    const id = ++latestLoad.current
    latestAggregates.current++
    setLoading(true)
    try {
      const [balances, itemsRes, dailyRes, recentRes] = await Promise.all([
        api.getBalances(),
        api.getItems(),
        api.getDailyTotals(),
        api.getTransactions({ limit: 5 }),
      ])
      if (id !== latestLoad.current) return
      setAccounts(balances.accounts)
      setItems(itemsRes.items)
      setDaily(dailyRes.days)
      setRecent(recentRes.transactions)
      setLoadError(null)
      setVersion((v) => v + 1)
    } catch (err) {
      if (id === latestLoad.current) setLoadError(describeLoadError(err as Error))
    } finally {
      if (id === latestLoad.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (signedIn) void reload()
  }, [signedIn, reload])

  const afterBankConnected = useCallback(() => {
    void reload()
    // The initial transaction sync runs in the background on the server.
    timers.current.push(setTimeout(() => void reload(), 6000))
  }, [reload])

  const syncAll = useCallback(async () => {
    const { results } = await api.syncTransactions()
    await reload()
    return results
  }, [reload])

  const disconnect = useCallback(
    async (itemId: string) => {
      await api.removeItem(itemId)
      await reload()
    },
    [reload],
  )

  // Persists one edit, then refreshes only what an edit can change: the
  // dashboard's recent rows and the daily totals (recategorising to or from
  // Transfer moves cash flow). Rejects on failure so the caller can roll back.
  const saveOverride = useCallback(
    async (transactionId: string, patch: OverridePatch) => {
      await api.setOverride(transactionId, patch)
      refreshAggregates().catch(() => {})
    },
    [refreshAggregates],
  )

  return {
    accounts,
    items,
    daily,
    recent,
    loading,
    loadError,
    version,
    reload,
    afterBankConnected,
    syncAll,
    disconnect,
    saveOverride,
  }
}
