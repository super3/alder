// Two-tone leaf mark: full leaf at 55% opacity with the lower half solid.
export function LogoLeaf({ size = 15, fill = '#FFFFFF' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <path d="M1.9 18.4 C10.4 20.4 16.8 13.4 16.8 1.6 C10.7 8.1 6 13.4 1.9 18.4 Z" fill={fill} opacity="0.55" />
      <path d="M1.9 18.4 C1.1 10.1 6.3 3.5 16.8 1.6 C10.7 8.1 6 13.4 1.9 18.4 Z" fill={fill} />
    </svg>
  )
}

export function SidebarCollapseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="var(--icon-2)" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <line x1="7.5" y1="3.5" x2="7.5" y2="16.5" />
    </svg>
  )
}

export function SidebarRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--icon)" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <line x1="12.5" y1="3.5" x2="12.5" y2="16.5" />
    </svg>
  )
}

export function DashboardIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="var(--icon)"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5 L10 3 L16.5 8.5 L16.5 16.2 L12 16.2 L12 11.5 L8 11.5 L8 16.2 L3.5 16.2 Z" />
    </svg>
  )
}

export function AccountsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--icon)" strokeWidth="1.6" strokeLinecap="round">
      <line x1="3" y1="4.5" x2="17" y2="4.5" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="15.5" x2="17" y2="15.5" />
    </svg>
  )
}

export function TransactionsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--icon)" strokeWidth="1.6">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <line x1="2.5" y1="8.5" x2="17.5" y2="8.5" />
    </svg>
  )
}

export function SettingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--icon)"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export function SlidersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--icon)" strokeWidth="1.6" strokeLinecap="round">
      <line x1="3" y1="6" x2="17" y2="6" />
      <circle cx="12.5" cy="6" r="2" fill="var(--card)" />
      <line x1="3" y1="13" x2="17" y2="13" />
      <circle cx="7" cy="13" r="2" fill="var(--card)" />
    </svg>
  )
}

export function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--icon)" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <line x1="3" y1="8.5" x2="17" y2="8.5" />
      <line x1="7" y1="3" x2="7" y2="6" />
      <line x1="13" y1="3" x2="13" y2="6" />
    </svg>
  )
}

export function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--icon)" strokeWidth="1.6" strokeLinecap="round">
      <line x1="4" y1="6" x2="16" y2="6" />
      <line x1="6" y1="10" x2="14" y2="10" />
      <line x1="8" y1="14" x2="12" y2="14" />
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--fainter)" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="9" cy="9" r="5.5" />
      <line x1="13.5" y1="13.5" x2="17" y2="17" />
    </svg>
  )
}

export function GroupChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke="var(--faint)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}
    >
      <polyline points="5,7.5 10,12.5 15,7.5" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <polyline
        points="1.5,5 4,7.5 8.5,2.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
