import { useCallback, useEffect, useState } from 'react'
import type { NotifPrefs } from '../screens/Settings'

const KEY = 'alder.notifications'
const DEFAULTS: NotifPrefs = { weekly: true, budget: true, large: false, updates: false }

function read(): NotifPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<NotifPrefs>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

// Per-device, like theme and privacy. Nothing is delivered yet; the Settings
// card says so.
export function useNotifPrefs() {
  const [prefs, setPrefs] = useState<NotifPrefs>(read)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      // Private browsing — preferences just won't survive a reload.
    }
  }, [prefs])

  const flip = useCallback((key: keyof NotifPrefs) => setPrefs((p) => ({ ...p, [key]: !p[key] })), [])
  return [prefs, flip] as const
}
