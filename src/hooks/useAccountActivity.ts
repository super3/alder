import { useEffect, useRef, useState } from 'react'
import { api, type PlaidTransaction } from '../api'

// An account's own recent transactions, queried by account rather than
// filtered out of a global page — so an account whose activity is older than
// everyone else's still shows it.
export function useAccountActivity(accountId: string | null, version: number, limit = 8) {
  const [rows, setRows] = useState<PlaidTransaction[] | null>(null)
  const latest = useRef(0)

  useEffect(() => {
    if (!accountId) return
    const id = ++latest.current
    setRows(null)
    api
      .getTransactions({ accountId, limit })
      .then((res) => {
        if (id === latest.current) setRows(res.transactions)
      })
      .catch(() => {
        if (id === latest.current) setRows([])
      })
  }, [accountId, version, limit])

  return rows
}
