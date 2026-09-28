import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type OverridePatch, type PlaidTransaction } from '../api'
import { rangeBounds, type TxRange } from '../lib/dates'
import { applyPatch } from '../lib/overrides'

export interface TxFilters {
  pending: boolean
  income: boolean
  transfers: boolean
}

const PAGE_SIZE = 100

// One server-filtered, paged view of the Transactions screen. Range and
// filters are applied by the server, so the counts are true totals rather than
// whatever happened to be in a single page.
export function useTransactionsPage(
  range: TxRange,
  filters: TxFilters,
  version: number,
  saveOverride: (transactionId: string, patch: OverridePatch) => Promise<void>,
  onError: (message: string) => void,
) {
  const [rows, setRows] = useState<PlaidTransaction[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const latest = useRef(0)

  const query = useMemo(
    () => ({
      ...rangeBounds(range),
      pendingOnly: filters.pending,
      incomeOnly: filters.income,
      excludeTransfers: !filters.transfers,
    }),
    [range, filters.pending, filters.income, filters.transfers],
  )

  useEffect(() => {
    const id = ++latest.current
    setLoading(true)
    api
      .getTransactions({ ...query, limit: PAGE_SIZE })
      .then((res) => {
        if (id !== latest.current) return
        setRows(res.transactions)
        setTotal(res.total)
      })
      .catch(() => {
        if (id === latest.current) onError("Couldn't load transactions. Try again in a moment.")
      })
      .finally(() => {
        if (id === latest.current) setLoading(false)
      })
    // onError is a stable notifier; refetch only when the query or data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, version])

  const loadMore = useCallback(() => {
    const id = latest.current
    const offset = rows?.length ?? 0
    setLoading(true)
    api
      .getTransactions({ ...query, limit: PAGE_SIZE, offset })
      .then((res) => {
        if (id !== latest.current) return
        setRows((prev) => [...(prev ?? []), ...res.transactions])
        setTotal(res.total)
      })
      .catch(() => onError("Couldn't load more transactions."))
      .finally(() => {
        if (id === latest.current) setLoading(false)
      })
  }, [query, rows, onError])

  // Optimistic: patch the row immediately, and put it back — visibly — if the
  // server refuses. A failed edit used to vanish on the next reload with no
  // explanation.
  const edit = useCallback(
    async (transactionId: string, patch: OverridePatch) => {
      const before = rows?.find((t) => t.transaction_id === transactionId)
      if (!before) return
      setRows((prev) => prev?.map((t) => (t.transaction_id === transactionId ? applyPatch(t, patch) : t)) ?? prev)
      try {
        await saveOverride(transactionId, patch)
      } catch {
        setRows((prev) => prev?.map((t) => (t.transaction_id === transactionId ? before : t)) ?? prev)
        onError("Couldn't save that change, so it's been undone.")
      }
    },
    [rows, saveOverride, onError],
  )

  return { rows, total, loading, hasMore: rows != null && rows.length < total, loadMore, edit }
}
