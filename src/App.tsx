import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MENUS, type ModalKind, type Screen, type SettingsSection } from './data'
import { MenuProvider } from './components/menu'
import { Sidebar } from './components/Sidebar'
import { ModalHost, ReconnectLink } from './components/Modals'
import { Dashboard, type DashCards } from './screens/Dashboard'
import { Accounts, type GroupId, type RefreshState } from './screens/Accounts'
import { AccountDetail } from './screens/AccountDetail'
import { Transactions } from './screens/Transactions'
import { Settings } from './screens/Settings'
import { Landing } from './screens/Landing'
import { usePrivacy, useTheme } from './theme'
import { useCategoryGroups } from './categories'
import { useAlderData } from './hooks/useAlderData'
import { useAccountActivity } from './hooks/useAccountActivity'
import { useClerkUser } from './hooks/useClerkUser'
import { useNotifPrefs } from './hooks/useNotifPrefs'
import { rangeBounds } from './lib/dates'
import {
  buildCashFlow,
  buildLiveSummary,
  buildNetWorthHistory,
  mapAccountsToGroups,
  mapItemsToInstitutions,
  toTransaction,
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

// Layout, navigation and view state. Data loading and mutations live in
// useAlderData; per-screen queries live in their own hooks.
function AppShell({ onSignOut }: { onSignOut: () => void }) {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalKind | null>(null)
  const [reconnectItemId, setReconnectItemId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [rangeIndex, setRangeIndex] = useState(0)
  const [dashCards, setDashCards] = useState<DashCards>({ networth: true, recent: true, cashflow: true })
  const [summaryMode, setSummaryMode] = useState<'totals' | 'percent'>('totals')
  const [openGroups, setOpenGroups] = useState<Record<GroupId, boolean>>({
    cash: true,
    credit: true,
    invest: true,
    property: true,
    loans: true,
  })
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')

  const [themePref, setThemePref] = useTheme()
  const [privacy, togglePrivacy] = usePrivacy()
  const [notif, flipNotif] = useNotifPrefs()
  const categories = useCategoryGroups()
  const { user, logIn, manageAccount } = useClerkUser()
  const data = useAlderData(user != null)

  const hasAccounts = Boolean(data.accounts?.length)
  const groups = useMemo(() => (hasAccounts ? mapAccountsToGroups(data.accounts!) : null), [hasAccounts, data.accounts])
  const summary = useMemo(() => (hasAccounts ? buildLiveSummary(data.accounts!) : null), [hasAccounts, data.accounts])
  const institutions = useMemo(
    () => mapItemsToInstitutions(data.items, data.accounts ?? []),
    [data.items, data.accounts],
  )
  const netWorthHistory = useMemo(
    () => (hasAccounts ? buildNetWorthHistory(data.accounts!, data.daily, MENUS.nwRange[rangeIndex]) : null),
    [hasAccounts, data.accounts, data.daily, rangeIndex],
  )
  const cashFlow = useMemo(() => {
    const monthStart = rangeBounds('This month').start
    return data.daily.some((day) => day.date >= monthStart) ? buildCashFlow(data.daily) : null
  }, [data.daily])
  const recent = useMemo(() => data.recent?.map(toTransaction) ?? null, [data.recent])

  const selectedAccount = useMemo(
    () => groups?.flatMap((g) => g.accounts).find((a) => a.id === selectedAccountId) ?? null,
    [groups, selectedAccountId],
  )
  const activityRows = useAccountActivity(screen === 'accountDetail' ? selectedAccountId : null, data.version)
  const activity = useMemo(() => activityRows?.map(toTransaction) ?? null, [activityRows])

  const needsAttention = institutions.filter((inst) => inst.status !== 'ok')

  const [refresh, setRefresh] = useState<RefreshState>('idle')
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(refreshTimer.current), [])

  // "Refresh all" re-syncs with Plaid, then says what actually happened.
  const doRefresh = async () => {
    if (refresh !== 'idle') return
    setRefresh('busy')
    try {
      const results = await data.syncAll()
      setRefresh(results.some((r) => !r.ok) ? 'partial' : 'done')
    } catch {
      setRefresh('failed')
    }
    refreshTimer.current = setTimeout(() => setRefresh('idle'), 3500)
  }

  const openAccountById = (accountId: string) => {
    // Ignoring an unknown id beats navigating to a blank detail screen.
    if (!groups?.some((g) => g.accounts.some((a) => a.id === accountId))) return
    setSelectedAccountId(accountId)
    setScreen('accountDetail')
  }

  const disconnect = (itemId: string) =>
    data.disconnect(itemId).catch(() => setNotice("Couldn't disconnect that bank. Try again in a moment."))

  const notify = useCallback((message: string) => setNotice(message), [])
  const addAccount = () => setModal('addAccount')

  return (
    <div className="app">
      <Sidebar screen={screen} onNavigate={setScreen} onSignOut={onSignOut} onLogIn={logIn} user={user} />

      <div className="main">
        {data.loadError && (
          <div className="load-error">
            <span>{data.loadError}</span>
            <span className="load-error-retry" onClick={() => void data.reload()}>
              Retry
            </span>
          </div>
        )}
        {notice && (
          <div className="load-error">
            <span>{notice}</span>
            <span className="load-error-retry" onClick={() => setNotice(null)}>
              Dismiss
            </span>
          </div>
        )}
        {needsAttention.map((inst) => (
          <div key={inst.itemId} className="load-error">
            <span>
              {inst.status === 'login_required'
                ? `${inst.name} needs you to sign in again — its balances are from ${inst.lastSynced}.`
                : `${inst.name} couldn't sync. Its balances may be out of date.`}
            </span>
            <span className="load-error-retry" onClick={() => setReconnectItemId(inst.itemId)}>
              Reconnect
            </span>
          </div>
        ))}
        {data.loading && !hasAccounts && !data.loadError && <div className="load-bar" />}

        {screen === 'dashboard' && (
          <Dashboard
            cards={dashCards}
            onFlipCard={(key) => setDashCards((s) => ({ ...s, [key]: !s[key] }))}
            onViewTransactions={() => setScreen('transactions')}
            netWorth={summary?.netWorth ?? null}
            netWorthHistory={netWorthHistory}
            rangeIndex={rangeIndex}
            onRangeSelect={setRangeIndex}
            recent={recent}
            cashFlow={cashFlow}
            onAddAccount={addAccount}
          />
        )}

        {screen === 'accounts' && (
          <Accounts
            openGroups={openGroups}
            onToggleGroup={(id) => setOpenGroups((s) => ({ ...s, [id]: !s[id] }))}
            summaryMode={summaryMode}
            onSetSummaryMode={setSummaryMode}
            refresh={refresh}
            onRefresh={() => void doRefresh()}
            onOpenAccount={(account) => openAccountById(account.id)}
            onAddAccount={addAccount}
            groups={groups}
            summary={summary}
            netWorthHistory={netWorthHistory}
            rangeIndex={rangeIndex}
            onRangeSelect={setRangeIndex}
          />
        )}

        {screen === 'accountDetail' && selectedAccount && (
          <AccountDetail
            account={selectedAccount}
            activity={activity}
            onBack={() => setScreen('accounts')}
            onViewTransactions={() => setScreen('transactions')}
          />
        )}

        {screen === 'transactions' && (
          <Transactions
            hasAccounts={hasAccounts}
            version={data.version}
            categoryGroups={categories.groups}
            saveOverride={data.saveOverride}
            onError={notify}
            onAddAccount={addAccount}
            onOpenAccount={openAccountById}
          />
        )}

        {screen === 'settings' && (
          <Settings
            section={settingsSection}
            onSetSection={setSettingsSection}
            profile={{ user, onManage: manageAccount, onLogIn: logIn, onSignOut }}
            preferences={{
              notif,
              onFlipNotif: flipNotif,
              privacy,
              onTogglePrivacy: togglePrivacy,
              themePref,
              onSetTheme: setThemePref,
            }}
            connections={{ institutions, onAdd: addAccount, onReconnect: setReconnectItemId, onDisconnect: disconnect }}
            categories={categories}
          />
        )}
      </div>

      <ModalHost modal={modal} onClose={() => setModal(null)} onBankConnected={data.afterBankConnected} />
      {reconnectItemId && (
        <ReconnectLink
          itemId={reconnectItemId}
          onError={notify}
          onDone={(reconnected) => {
            setReconnectItemId(null)
            // A successful sync is what marks the item healthy again.
            if (reconnected) data.syncAll().catch(() => notify("Reconnected, but the first sync failed."))
          }}
        />
      )}
    </div>
  )
}
