import { useCallback, useEffect, useState } from 'react'
import { getClerk } from '../clerk'
import { initialsOf } from '../plaidMapping'
import type { SidebarUser } from '../components/Sidebar'

// The signed-in Clerk user (null when signed out), plus the two Clerk actions
// the app offers.
export function useClerkUser() {
  const [user, setUser] = useState<SidebarUser | null>(null)

  useEffect(() => {
    let cancelled = false
    getClerk()
      .then((clerk) => {
        const u = clerk.user
        if (cancelled || !u) return
        const email = u.primaryEmailAddress?.emailAddress ?? ''
        const name = u.fullName || u.firstName || email || 'Account'
        setUser({ name, email, initials: initialsOf(name) })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const logIn = useCallback(() => {
    getClerk()
      .then((clerk) => clerk.openSignIn?.({ afterSignInUrl: '/#app', afterSignUpUrl: '/#app' }))
      .catch(() => {})
  }, [])

  const manageAccount = useCallback(() => {
    getClerk()
      .then((clerk) => clerk.openUserProfile?.())
      .catch(() => {})
  }, [])

  return { user, logIn, manageAccount }
}
