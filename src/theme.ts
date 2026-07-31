// Theme + privacy preferences. Both are per-device (the Settings copy says
// "How Alder looks on this device"), so they live in localStorage and are
// applied as attributes on <html> rather than threaded through React — that
// keeps the toggles free of re-render cost and lets plain CSS do the work.
import { useCallback, useEffect, useState } from 'react'

export type ThemePref = 'light' | 'dark' | 'auto'

const THEME_KEY = 'alder.theme'
const PRIVACY_KEY = 'alder.privacy'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function readThemePref(): ThemePref {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'auto') return pref
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', resolved)
}

// The landing page is a light-only marketing design, so the app shell owns the
// theme attribute and resets it on unmount.
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readThemePref)

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, pref)
    } catch {
      // Private browsing — the preference just won't survive a reload.
    }
    applyTheme(resolveTheme(pref))
  }, [pref])

  // Only 'auto' follows the OS; an explicit choice is never overridden.
  useEffect(() => {
    if (pref !== 'auto') return
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => applyTheme(query.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [pref])

  return [pref, setPref] as const
}

export function readPrivacyPref(): boolean {
  try {
    return localStorage.getItem(PRIVACY_KEY) === '1'
  } catch {
    return false
  }
}

// A privacy toggle that silently resets on reload would be worse than none.
export function usePrivacy() {
  const [privacy, setPrivacy] = useState<boolean>(readPrivacyPref)

  useEffect(() => {
    try {
      localStorage.setItem(PRIVACY_KEY, privacy ? '1' : '0')
    } catch {
      // As above.
    }
    if (privacy) document.documentElement.setAttribute('data-privacy', 'on')
    else document.documentElement.removeAttribute('data-privacy')
  }, [privacy])

  const toggle = useCallback(() => setPrivacy((on) => !on), [])
  return [privacy, toggle] as const
}
