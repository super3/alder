import { useEffect, useRef, useState } from 'react'
import type { Transaction } from '../data'
import { CATEGORIES } from '../data'
import type { CategoryGroup } from '../categories'
import type { OverridePatch } from '../api'
import { Avatar } from './primitives'

interface EditableTransactionRowProps {
  transaction: Transaction
  categoryGroups: CategoryGroup[]
  onEdit: (transactionId: string, patch: OverridePatch) => void
  onOpenAccount: (accountId: string) => void
}

// Closes a popover on outside click or Escape.
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

export function EditableTransactionRow({
  transaction: t,
  categoryGroups,
  onEdit,
  onOpenAccount,
}: EditableTransactionRowProps) {
  const [merchantOpen, setMerchantOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [draft, setDraft] = useState(t.merchant)

  const merchantRef = useDismiss(merchantOpen, () => setMerchantOpen(false))
  const categoryRef = useDismiss(categoryOpen, () => setCategoryOpen(false))

  const openMerchant = () => {
    setDraft(t.merchant)
    setMerchantOpen(true)
  }

  // Choosing Plaid's own name (or clearing the field) resets the override
  // rather than pinning a copy that would stop following Plaid's updates.
  const renameTo = (raw: string) => {
    const name = raw.trim()
    setMerchantOpen(false)
    if (name === t.merchant) return
    onEdit(t.id, { merchant_name: !name || name === t.plaidMerchant ? null : name })
  }

  // Re-picking the category already shown is a no-op, not an override that
  // would pin Plaid's current guess.
  const chooseCategory = (name: string | null) => {
    setCategoryOpen(false)
    if (name === null ? !t.categoryEdited : name === t.category.name) return
    onEdit(t.id, { category: name })
  }

  // Plaid's cleaned name and the raw statement descriptor, minus duplicates.
  const suggestions = [...new Set([t.plaidMerchant, t.statementName])].filter(Boolean)

  const categoryNames = [
    ...new Set([
      ...categoryGroups.flatMap((g) => g.cats.map((c) => c.name)),
      ...Object.values(CATEGORIES).map((c) => c.name),
    ]),
  ]

  return (
    <div className="tx-grid-row">
      <div className="tx-grid-merchant">
        <Avatar initials={t.initials} bg={t.avatarBg} fg={t.avatarFg} size={34} fontSize={12.5} />
        <div className="tx-cell-edit" ref={merchantRef}>
          <button type="button" className="tx-grid-name tx-editable" onClick={openMerchant} title="Rename merchant">
            {t.merchant}
            {(t.merchantEdited || t.categoryEdited) && <span className="tx-edited-dot" title="Edited" />}
          </button>
          {t.pending && <span className="tx-pending">Pending</span>}
          {merchantOpen && (
            <div className="tx-pop">
              <input
                className="tx-pop-input"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameTo(draft)
                }}
              />
              <div className="tx-pop-label">Use instead</div>
              {suggestions.map((name) => (
                <div key={name} className="tx-pop-item" onClick={() => renameTo(name)}>
                  {name}
                </div>
              ))}
              <div className="tx-pop-sep" />
              <div className="tx-pop-item" onClick={() => renameTo(draft)}>
                Save
              </div>
              {t.merchantEdited && (
                <div className="tx-pop-item muted" onClick={() => renameTo(t.plaidMerchant)}>
                  Reset name to original
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="tx-grid-category">
        <div className="tx-cell-edit" ref={categoryRef}>
          <button
            type="button"
            className="tx-editable tx-category-btn"
            onClick={() => setCategoryOpen(true)}
            title="Change category"
          >
            <span className="tx-grid-emoji">{t.category.emoji}</span>
            <span className="tx-grid-truncate">{t.category.name}</span>
          </button>
          {categoryOpen && (
            <div className="tx-pop">
              <div className="tx-pop-label">Category</div>
              <div className="tx-pop-scroll">
                {categoryNames.map((name) => (
                  <div
                    key={name}
                    className={`tx-pop-item${name === t.category.name ? ' active' : ''}`}
                    onClick={() => chooseCategory(name)}
                  >
                    {name}
                  </div>
                ))}
              </div>
              {t.categoryEdited && (
                <>
                  <div className="tx-pop-sep" />
                  <div className="tx-pop-item muted" onClick={() => chooseCategory(null)}>
                    Reset category to original
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="tx-grid-account">
        <button
          type="button"
          className="tx-editable tx-account-btn"
          title={`Open ${t.account.name}`}
          onClick={() => onOpenAccount(t.account.id)}
        >
          <Avatar
            initials={t.account.initials}
            bg={t.account.avatarBg}
            fg={t.account.avatarFg}
            size={20}
            fontSize={9}
          />
          <span className="tx-grid-truncate">{t.account.name}</span>
        </button>
      </div>

      <span className={`tx-grid-amount${t.positive ? ' positive' : ''}`}>{t.amount}</span>
    </div>
  )
}
