import { useState } from 'react'
import type { Screen } from '../data'
import { useMenu } from './menu'
import { AccountsIcon, DashboardIcon, LogoLeaf, SettingsIcon, SidebarCollapseIcon, TransactionsIcon } from './icons'

export interface SidebarUser {
  name: string
  email: string
  initials: string
}

const GUEST: SidebarUser = { name: 'Not logged in', email: 'Log in to sync your banks', initials: '?' }

interface SidebarProps {
  screen: Screen
  onNavigate: (screen: Screen) => void
  onSignOut: () => void
  onLogIn: () => void
  user?: SidebarUser | null
}

interface NavItemProps {
  label: string
  icon: React.ReactNode
  active: boolean
  expanded: boolean
  onClick: () => void
}

function NavItem({ label, icon, active, expanded, onClick }: NavItemProps) {
  return (
    <div
      className={`nav-item${active ? ' active' : ''}`}
      style={{ justifyContent: expanded ? 'flex-start' : 'center', padding: expanded ? '8px 11px' : '8px 0' }}
      onClick={onClick}
    >
      {icon}
      <span style={{ display: expanded ? 'inline' : 'none' }}>{label}</span>
    </div>
  )
}

export function Sidebar({ screen, onNavigate, onSignOut, onLogIn, user }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [hoverExpand, setHoverExpand] = useState(false)
  const { openMenu, toggleMenu, setOpenMenu } = useMenu()
  const profile = user ?? GUEST

  const expanded = !collapsed || hoverExpand
  const overlay = collapsed && hoverExpand

  return (
    <div className="sidebar-slot" style={{ width: collapsed ? 68 : 248 }}>
      <div
        className={`sidebar${overlay ? ' overlay' : ''}`}
        style={{ width: expanded ? 248 : 68 }}
        onMouseEnter={() => {
          if (collapsed) setHoverExpand(true)
        }}
        onMouseLeave={() => setHoverExpand(false)}
      >
        <div
          className="sidebar-top"
          style={{ flexDirection: expanded ? 'row' : 'column', padding: expanded ? '18px 14px 12px 16px' : '18px 0 12px 0' }}
        >
          <div
            className="sidebar-logo"
            style={{ cursor: collapsed ? 'pointer' : 'default' }}
            onClick={() => {
              if (collapsed) {
                setCollapsed(false)
                setHoverExpand(false)
              }
            }}
          >
            <div className="sidebar-logo-mark">
              <LogoLeaf />
            </div>
            <span className="sidebar-logo-name" style={{ display: expanded ? 'inline' : 'none' }}>
              Alder
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div
              className="sidebar-collapse-btn"
              style={{ display: expanded ? 'flex' : 'none' }}
              onClick={() => {
                setCollapsed(!collapsed)
                setHoverExpand(false)
              }}
            >
              <SidebarCollapseIcon />
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          <NavItem
            label="Dashboard"
            icon={<DashboardIcon />}
            active={screen === 'dashboard'}
            expanded={expanded}
            onClick={() => onNavigate('dashboard')}
          />
          <NavItem
            label="Accounts"
            icon={<AccountsIcon />}
            active={screen === 'accounts' || screen === 'accountDetail'}
            expanded={expanded}
            onClick={() => onNavigate('accounts')}
          />
          <NavItem
            label="Transactions"
            icon={<TransactionsIcon />}
            active={screen === 'transactions'}
            expanded={expanded}
            onClick={() => onNavigate('transactions')}
          />
        </div>

        <div style={{ flex: 1 }} />

        <div className="sidebar-bottom">
          <NavItem
            label="Settings"
            icon={<SettingsIcon />}
            active={screen === 'settings'}
            expanded={expanded}
            onClick={() => onNavigate('settings')}
          />
          <div style={{ position: 'relative' }}>
            <div
              className="profile-row"
              style={{ justifyContent: expanded ? 'flex-start' : 'center', padding: expanded ? '7px 11px' : '7px 0' }}
              onClick={(e) => {
                e.stopPropagation()
                toggleMenu('profile')
              }}
            >
              <div className="profile-avatar">{profile.initials}</div>
              <span className="profile-name" style={{ display: expanded ? 'inline' : 'none' }}>
                {profile.name}
              </span>
              <span className="profile-caret" style={{ display: expanded ? 'inline' : 'none' }}>
                ▾
              </span>
            </div>
            {openMenu === 'profile' && (
              <div className="profile-menu" onClick={(e) => e.stopPropagation()}>
                <div className="profile-menu-header">
                  <div className="profile-menu-name">{profile.name}</div>
                  <div className="profile-menu-email">{profile.email}</div>
                </div>
                <div
                  className="menu-item"
                  onClick={() => {
                    onNavigate('settings')
                    setOpenMenu(null)
                  }}
                >
                  Settings
                </div>
                <div
                  className="menu-item"
                  onClick={() => {
                    setOpenMenu(null)
                    if (user) onSignOut()
                    else onLogIn()
                  }}
                >
                  {user ? 'Sign out' : 'Log in'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
