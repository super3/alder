import { useEffect, useRef, useState } from 'react'
import type { Account, MenuKey, ModalKind, Screen, SettingsSection } from './data'
import { MenuProvider } from './components/menu'
import { Sidebar } from './components/Sidebar'
import { ModalHost } from './components/Modals'
import { Dashboard, type DashCards } from './screens/Dashboard'
import { Accounts, type GroupId, type RefreshState } from './screens/Accounts'
import { AccountDetail } from './screens/AccountDetail'
import { Transactions, type TxFilters } from './screens/Transactions'
import { Settings, type NotifPrefs } from './screens/Settings'
import { Landing } from './screens/Landing'
import { getClerk } from './clerk'
import { usePrivacy, useTheme } from './theme'
import type { SidebarUser } from './components/Sidebar'
import { api, type PlaidAccount, type PlaidTransaction } from './api'
import {
  buildCashFlow,
  buildLiveSummary,
  mapAccountsToGroups,
  mapAccountsToInstitutions,
  mapTransactionsToDays,
  mapTransactionsToRecent,
} from './plaidMapping'

// The landing page is the homepage; the app lives at #app so direct links
// work on GitHub Pages without any server-side routing. Other hashes
// (#features, #waitlist) are in-page anchors on the landing page.
const pageFromHash = () => (window.location.hash === '#app' ? 'app' : 'landing')

export default function App() {
  const [page, setPage] = useState<'landing' | 'app'>(pageFromHash)

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (page === 'app') window.scrollTo(0, 0)
  }, [page])

  // The landing page is a light-only marketing design but shares the app's
  // tokens, so pin it to light; the shell reapplies the real theme on entry.
  useEffect(() => {
    if (page === 'landing') document.documentElement.setAttribute('data-theme', 'light')
  }, [page])

  const signOut = () => {
    const finish = () => {
      window.location.hash = ''
      history.replaceState(null, '', window.location.pathname + window.location.search)
      setPage('landing')
    }
    // If a Clerk session exists, end it for real before returning home.
    if (window.Clerk?.user) window.Clerk.signOut().then(finish, finish)
    else finish()
  }

  if (page === 'landing') return <Landing />

  return (
    <MenuProvider>
      <AppShell onSignOut={signOut} />
    </MenuProvider>
  )
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/)
  const letters = words.length >= 2 ? [words[0][0], words[1][0]] : [name[0], name[1] ?? '']
  return letters.join('').toUpperCase()
}

function AppShell({ onSignOut }: { onSignOut: () => void }) {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [modal, setModal] = useState<ModalKind | null>(null)

  const [menuSel, setMenuSel] = useState<Record<MenuKey, number>>({ txDate: 0 })
  const [dashCards, setDashCards] = useState<DashCards>({ networth: true, recent: true, cashflow: true })
  const [txFilters, setTxFilters] = useState<TxFilters>({ pending: false, income: false, transfers: true })
  const [summaryMode, setSummaryMode] = useState<'totals' | 'percent'>('totals')
  const [openGroups, setOpenGroups] = useState<Record<GroupId, boolean>>({
    cash: true,
    credit: true,
    invest: true,
    property: true,
    loans: true,
  })
  const [notif, setNotif] = useState<NotifPrefs>({ weekly: true, budget: true, large: false, updates: false })
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')

  const [themePref, setThemePref] = useTheme()
  const [privacy, togglePrivacy] = usePrivacy()

  const [refresh, setRefresh] = useState<RefreshState>('idle')
  const refreshTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => refreshTimers.current.forEach(clearTimeout), [])

  // The signed-in Clerk user drives the sidebar and Settings profile.
  const [clerkUser, setClerkUser] = useState<SidebarUser | null>(null)
  useEffect(() => {
    let cancelled = false
    getClerk()
      .then((clerk) => {
        const u = clerk.user
        if (cancelled || !u) return
        const email = u.primaryEmailAddress?.emailAddress ?? ''
        const name = u.fullName || u.firstName || email || 'Account'
        setClerkUser({ name, email, initials: initialsOf(name) })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const logIn = () => {
    getClerk()
      .then((clerk) => clerk.openSignIn?.({ afterSignInUrl: '/#app', afterSignUpUrl: '/#app' }))
      .catch(() => {})
  }

  const manageAccount = () => {
    getClerk()
      .then((clerk) => clerk.openUserProfile?.())
      .catch(() => {})
  }

  // Live Plaid data. Every screen renders from this; empty states show
  // whenever it's absent (signed out, no connections, API unreachable).
  const [liveAccounts, setLiveAccounts] = useState<PlaidAccount[] | null>(null)
  const [liveTxns, setLiveTxns] = useState<PlaidTransaction[] | null>(null)

  const loadPlaidData = () => {
    Promise.all([api.getBalances(), api.getTransactions()])
      .then(([balances, transactions]) => {
        setLiveAccounts(balances.accounts)
        setLiveTxns(transactions.transactions)
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (clerkUser) loadPlaidData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkUser])

  const onBankConnected = () => {
    loadPlaidData()
    // The initial transaction sync runs in the background on the server;
    // pick up its results shortly after the connection completes.
    setTimeout(loadPlaidData, 6000)
  }

  const hasAccounts = Boolean(liveAccounts && liveAccounts.length > 0)
  const groups = hasAccounts ? mapAccountsToGroups(liveAccounts!) : null
  const summary = hasAccounts ? buildLiveSummary(liveAccounts!) : null
  const institutions = hasAccounts ? mapAccountsToInstitutions(liveAccounts!) : null
  const days = liveTxns && liveTxns.length > 0 ? mapTransactionsToDays(liveTxns) : null
  const recent = liveTxns && liveTxns.length > 0 ? mapTransactionsToRecent(liveTxns, 5) : null
  const cashFlow = liveTxns && liveTxns.length > 0 ? buildCashFlow(liveTxns) : null
  const txnCount = liveTxns?.length ?? 0

  const accountActivity =
    selectedAccount && liveTxns
      ? mapTransactionsToRecent(
          liveTxns.filter((txn) => txn.account_id === selectedAccount.id),
          8,
        )
      : []

  // "Refresh all" asks the server to re-sync with Plaid, then reloads.
  const doRefresh = () => {
    if (refresh !== 'idle') return
    setRefresh('busy')
    api
      .syncTransactions()
      .catch(() => {})
      .then(() => {
        loadPlaidData()
        setRefresh('done')
        refreshTimers.current.push(setTimeout(() => setRefresh('idle'), 2500))
      })
  }

  const selectMenu = (key: MenuKey, index: number) => setMenuSel((s) => ({ ...s, [key]: index }))

  const openAccount = (account: Account) => {
    setSelectedAccount(account)
    setScreen('accountDetail')
  }

  return (
    <div className="app">
      <Sidebar screen={screen} onNavigate={setScreen} onSignOut={onSignOut} onLogIn={logIn} user={clerkUser} />

      <div className="main">
        {screen === 'dashboard' && (
          <Dashboard
            cards={dashCards}
            onFlipCard={(key) => setDashCards((s) => ({ ...s, [key]: !s[key] }))}
            onViewTransactions={() => setScreen('transactions')}
            netWorth={summary?.netWorth ?? null}
            recent={recent}
            cashFlow={cashFlow}
            onAddAccount={() => setModal('addAccount')}
          />
        )}

        {screen === 'accounts' && (
          <Accounts
            openGroups={openGroups}
            onToggleGroup={(id) => setOpenGroups((s) => ({ ...s, [id]: !s[id] }))}
            summaryMode={summaryMode}
            onSetSummaryMode={setSummaryMode}
            refresh={refresh}
            onRefresh={doRefresh}
            onOpenAccount={openAccount}
            onAddAccount={() => setModal('addAccount')}
            groups={groups}
            summary={summary}
          />
        )}

        {screen === 'accountDetail' && selectedAccount && (
          <AccountDetail
            account={selectedAccount}
            activity={accountActivity}
            onBack={() => setScreen('accounts')}
            onViewTransactions={() => setScreen('transactions')}
          />
        )}

        {screen === 'transactions' && (
          <Transactions
            menuSel={menuSel}
            onMenuSelect={selectMenu}
            filters={txFilters}
            onFlipFilter={(key) => setTxFilters((s) => ({ ...s, [key]: !s[key] }))}
            onAddAccount={() => setModal('addAccount')}
            days={days}
            count={txnCount}
          />
        )}

        {screen === 'settings' && (
          <Settings
            section={settingsSection}
            onSetSection={setSettingsSection}
            notif={notif}
            onFlipNotif={(key) => setNotif((s) => ({ ...s, [key]: !s[key] }))}
            user={clerkUser}
            institutions={institutions}
            onAddAccount={() => setModal('addAccount')}
            onManageAccount={manageAccount}
            onLogIn={logIn}
            onSignOut={onSignOut}
            privacy={privacy}
            onTogglePrivacy={togglePrivacy}
            themePref={themePref}
            onSetTheme={setThemePref}
          />
        )}
      </div>

      <ModalHost modal={modal} onClose={() => setModal(null)} onBankConnected={onBankConnected} />
    </div>
  )
}
