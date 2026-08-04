import type { Institution, SettingsSection } from '../data'
import { Avatar, Toggle } from '../components/primitives'
import type { SidebarUser } from '../components/Sidebar'
import type { ThemePref } from '../theme'
import type { CategoryGroup } from '../categories'
import { CategorySettings } from '../components/CategorySettings'

export interface NotifPrefs {
  weekly: boolean
  budget: boolean
  large: boolean
  updates: boolean
}

interface SettingsProps {
  section: SettingsSection
  onSetSection: (section: SettingsSection) => void
  notif: NotifPrefs
  onFlipNotif: (key: keyof NotifPrefs) => void
  user: SidebarUser | null
  institutions: Institution[] | null
  onAddAccount: () => void
  onDisconnect: (itemId: string) => void
  onManageAccount: () => void
  onLogIn: () => void
  onSignOut: () => void
  privacy: boolean
  onTogglePrivacy: () => void
  themePref: ThemePref
  onSetTheme: (pref: ThemePref) => void
  categoryGroups: CategoryGroup[]
  onAddGroup: (section: CategoryGroup['section']) => void
  onRenameGroup: (index: number, name: string) => void
  onAddCategory: (index: number, emoji: string, name: string) => void
  onRemoveCategory: (groupIndex: number, catIndex: number) => void
}

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' },
]

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'categories', label: 'Categories' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
  { id: 'connected', label: 'Connected accounts' },
]

const NOTIF_ROWS: { key: keyof NotifPrefs; title: string; sub: string }[] = [
  { key: 'weekly', title: 'Weekly summary', sub: 'A Sunday-evening recap of your week' },
  { key: 'budget', title: 'Budget alerts', sub: 'When a category passes 90% of its target' },
  { key: 'large', title: 'Large transactions', sub: 'Anything over $500 in one charge' },
  { key: 'updates', title: 'Product updates', sub: 'Occasional news about new features' },
]

const CONNECTED_PILL = { background: 'oklch(0.95 0.04 165)', color: 'oklch(0.4 0.09 165)' }
const RECONNECT_PILL = { background: 'oklch(0.96 0.05 85)', color: 'oklch(0.5 0.11 70)' }

export function Settings({
  section,
  onSetSection,
  notif,
  onFlipNotif,
  user,
  institutions,
  onAddAccount,
  onDisconnect,
  onManageAccount,
  onLogIn,
  onSignOut,
  privacy,
  onTogglePrivacy,
  themePref,
  onSetTheme,
  categoryGroups,
  onAddGroup,
  onRenameGroup,
  onAddCategory,
  onRemoveCategory,
}: SettingsProps) {
  return (
    <div className="screen">
      <div className="screen-header">
        <span className="screen-title">Settings</span>
      </div>
      <div className="screen-body">
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {SECTIONS.map((s) => (
              <div
                key={s.id}
                className={`settings-nav-item${section === s.id ? ' active' : ''}`}
                onClick={() => onSetSection(s.id)}
              >
                {s.label}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0, maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {section === 'general' && (
              <>
                <div className="card">
                  <div style={{ padding: '15px 20px', fontSize: 16.5, fontWeight: 650 }}>Profile</div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '14px 20px',
                      borderTop: '1px solid var(--divider)',
                    }}
                  >
                    {user ? (
                      <>
                        <Avatar
                          initials={user.initials}
                          bg="oklch(0.85 0.05 165)"
                          fg="oklch(0.35 0.08 165)"
                          size={44}
                          fontSize={15}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{user.name}</div>
                          <div style={{ fontSize: 13.5, color: 'var(--faint)' }}>{user.email}</div>
                        </div>
                        <div className="btn-small" onClick={onManageAccount}>
                          Manage
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: 'var(--muted)' }}>
                          You're not logged in.
                        </div>
                        <div className="btn-small" onClick={onLogIn}>
                          Log in
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div style={{ padding: '15px 20px', fontSize: 16.5, fontWeight: 650 }}>Preferences</div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-title">Currency</div>
                      <div className="settings-row-sub">Used for all balances and budgets</div>
                    </div>
                    <div className="select-btn">
                      <span>USD $</span>
                      <span className="select-caret">▾</span>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-title">Month starts on</div>
                      <div className="settings-row-sub">First day of your budget cycle</div>
                    </div>
                    <div className="select-btn">
                      <span>1st of the month</span>
                      <span className="select-caret">▾</span>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-title">Privacy mode</div>
                      <div className="settings-row-sub">Blur balances until you hover over them</div>
                    </div>
                    <Toggle on={privacy} onToggle={onTogglePrivacy} />
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-title">Theme</div>
                      <div className="settings-row-sub">How Alder looks on this device</div>
                    </div>
                    <div className="seg">
                      {THEME_OPTIONS.map((option) => (
                        <span
                          key={option.value}
                          className={`seg-item${themePref === option.value ? ' active' : ''}`}
                          onClick={() => onSetTheme(option.value)}
                        >
                          {option.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {section === 'categories' && (
              <CategorySettings
                groups={categoryGroups}
                onAddGroup={onAddGroup}
                onRenameGroup={onRenameGroup}
                onAddCategory={onAddCategory}
                onRemoveCategory={onRemoveCategory}
              />
            )}

            {section === 'notifications' && (
              <div className="card">
                <div style={{ padding: '15px 20px', fontSize: 16.5, fontWeight: 650 }}>Notifications</div>
                {NOTIF_ROWS.map((row) => (
                  <div key={row.key} className="settings-row">
                    <div>
                      <div className="settings-row-title">{row.title}</div>
                      <div className="settings-row-sub">{row.sub}</div>
                    </div>
                    <Toggle on={notif[row.key]} onToggle={() => onFlipNotif(row.key)} />
                  </div>
                ))}
                <div
                  style={{
                    padding: '12px 20px',
                    borderTop: '1px solid var(--divider)',
                    fontSize: 13,
                    color: 'var(--faint)',
                  }}
                >
                  Alder isn't sending notifications yet — these preferences are saved on this device
                  and will apply once delivery is switched on.
                </div>
              </div>
            )}

            {section === 'security' && (
              <>
                <div className="card">
                  <div style={{ padding: '15px 20px', fontSize: 16.5, fontWeight: 650 }}>Security</div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-title">Sign-in &amp; security</div>
                      <div className="settings-row-sub">
                        Password, email, and sessions are managed through your Clerk account
                      </div>
                    </div>
                    {user ? (
                      <div className="btn-small" onClick={onManageAccount}>
                        Manage
                      </div>
                    ) : (
                      <div className="btn-small" onClick={onLogIn}>
                        Log in
                      </div>
                    )}
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-title">Bank connections</div>
                      <div className="settings-row-sub">
                        Read-only access through Plaid — Alder never sees your bank credentials
                      </div>
                    </div>
                  </div>
                </div>

                {user && (
                  <div style={{ padding: '2px 4px' }}>
                    <span
                      style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer' }}
                      onClick={onSignOut}
                    >
                      Sign out
                    </span>
                  </div>
                )}
              </>
            )}

            {section === 'connected' && (
              <div className="card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '15px 20px',
                  }}
                >
                  <span style={{ fontSize: 16.5, fontWeight: 650 }}>Connected accounts</span>
                  <div className="btn-small" onClick={onAddAccount}>
                    + Add
                  </div>
                </div>
                {institutions && institutions.length > 0 ? (
                  institutions.map((inst) => (
                    <div
                      key={inst.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 13,
                        padding: '13px 20px',
                        borderTop: '1px solid var(--divider)',
                      }}
                    >
                      <Avatar initials={inst.initials} bg={inst.avatarBg} fg={inst.avatarFg} size={36} fontSize={13} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{inst.name}</div>
                        <div style={{ fontSize: 13.5, color: 'var(--faint)' }}>{inst.sub}</div>
                      </div>
                      <span
                        className="status-pill"
                        style={inst.status === 'connected' ? CONNECTED_PILL : RECONNECT_PILL}
                      >
                        {inst.status === 'connected' ? 'Connected' : 'Reconnect'}
                      </span>
                      {inst.itemId && (
                        <div
                          className="btn-small danger"
                          onClick={() => {
                            // Plaid bills per item per month until /item/remove
                            // is called, so this is not just a local delete.
                            if (
                              window.confirm(
                                `Disconnect ${inst.name}? Its accounts and transactions will be removed from Alder and Plaid will stop syncing it.`,
                              )
                            ) {
                              onDisconnect(inst.itemId!)
                            }
                          }}
                        >
                          Disconnect
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      padding: '18px 20px',
                      borderTop: '1px solid var(--divider)',
                      fontSize: 14,
                      color: 'var(--faint)',
                    }}
                  >
                    No banks connected yet — use “+ Add” to connect one through Plaid.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
