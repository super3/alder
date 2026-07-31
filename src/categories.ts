// The user-editable category taxonomy shown in Settings > Categories.
// The prototype keeps this in component state, which means a category you
// create disappears on reload — so it persists per-device here, the same way
// theme and privacy do.
import { useCallback, useEffect, useState } from 'react'

export interface UserCategory {
  emoji: string
  name: string
  custom?: boolean
}

export interface CategoryGroup {
  section: 'income' | 'expense'
  name: string
  cats: UserCategory[]
}

// Emoji offered when naming a new category.
export const EMOJI_CHOICES = ['🏷️', '🐾', '✈️', '🎓', '💪']

const KEY = 'alder.categories'

export const DEFAULT_CATEGORY_GROUPS: CategoryGroup[] = [
  {
    section: 'income',
    name: 'Income',
    cats: [
      { emoji: '💵', name: 'Paychecks' },
      { emoji: '🏦', name: 'Interest' },
      { emoji: '💰', name: 'Other Income', custom: true },
    ],
  },
  {
    section: 'expense',
    name: 'Essentials',
    cats: [
      { emoji: '🏠', name: 'Housing' },
      { emoji: '🛒', name: 'Groceries' },
      { emoji: '💡', name: 'Utilities' },
      { emoji: '🚌', name: 'Transportation' },
    ],
  },
  {
    section: 'expense',
    name: 'Lifestyle',
    cats: [
      { emoji: '🍽️', name: 'Dining out' },
      { emoji: '🛍️', name: 'Shopping' },
      { emoji: '🎬', name: 'Entertainment' },
      { emoji: '✈️', name: 'Travel', custom: true },
    ],
  },
  {
    section: 'expense',
    name: 'Savings & debt',
    cats: [
      { emoji: '🛟', name: 'Emergency fund' },
      { emoji: '📈', name: 'Roth IRA' },
      { emoji: '🎓', name: 'Student loan' },
    ],
  },
]

function isGroup(value: unknown): value is CategoryGroup {
  const g = value as CategoryGroup
  return (
    !!g &&
    typeof g === 'object' &&
    (g.section === 'income' || g.section === 'expense') &&
    typeof g.name === 'string' &&
    Array.isArray(g.cats) &&
    g.cats.every((c) => c && typeof c.emoji === 'string' && typeof c.name === 'string')
  )
}

function read(): CategoryGroup[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_CATEGORY_GROUPS
    const parsed: unknown = JSON.parse(raw)
    // Anything unrecognised falls back rather than rendering a broken screen.
    return Array.isArray(parsed) && parsed.every(isGroup) ? (parsed as CategoryGroup[]) : DEFAULT_CATEGORY_GROUPS
  } catch {
    return DEFAULT_CATEGORY_GROUPS
  }
}

export function useCategoryGroups() {
  const [groups, setGroups] = useState<CategoryGroup[]>(read)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(groups))
    } catch {
      // Private browsing — edits just won't survive a reload.
    }
  }, [groups])

  const addGroup = useCallback((section: CategoryGroup['section']) => {
    setGroups((gs) => [
      ...gs,
      { section, name: section === 'income' ? 'New income group' : 'New group', cats: [] },
    ])
  }, [])

  const renameGroup = useCallback((index: number, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setGroups((gs) => gs.map((g, i) => (i === index ? { ...g, name: trimmed } : g)))
  }, [])

  const addCategory = useCallback((index: number, emoji: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setGroups((gs) =>
      gs.map((g, i) => (i === index ? { ...g, cats: [...g.cats, { emoji, name: trimmed, custom: true }] } : g)),
    )
  }, [])

  const removeCategory = useCallback((groupIndex: number, catIndex: number) => {
    setGroups((gs) =>
      gs.map((g, i) => (i === groupIndex ? { ...g, cats: g.cats.filter((_, j) => j !== catIndex) } : g)),
    )
  }, [])

  return { groups, addGroup, renameGroup, addCategory, removeCategory }
}
