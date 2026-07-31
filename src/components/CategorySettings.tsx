import { useState } from 'react'
import { EMOJI_CHOICES, type CategoryGroup } from '../categories'
import { DragHandleIcon, InfoIcon, TrashIcon } from './icons'

interface CategorySettingsProps {
  groups: CategoryGroup[]
  onAddGroup: (section: CategoryGroup['section']) => void
  onRenameGroup: (index: number, name: string) => void
  onAddCategory: (index: number, emoji: string, name: string) => void
  onRemoveCategory: (groupIndex: number, catIndex: number) => void
}

const SECTIONS: { section: CategoryGroup['section']; label: string }[] = [
  { section: 'income', label: 'Income' },
  { section: 'expense', label: 'Expenses' },
]

// Inline rename — the mock shows an "Edit" affordance beside each group name
// but wires nothing to it, and a control that does nothing is worse than none.
function GroupName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  const commit = () => {
    onRename(draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        className="cat-group-name-input"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(name)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <>
      <span className="cat-group-name">{name}</span>
      <span
        className="cat-group-edit"
        onClick={() => {
          setDraft(name)
          setEditing(true)
        }}
      >
        Edit
      </span>
    </>
  )
}

function GroupCard({
  group,
  index,
  onRenameGroup,
  onAddCategory,
  onRemoveCategory,
}: {
  group: CategoryGroup
  index: number
  onRenameGroup: (index: number, name: string) => void
  onAddCategory: (index: number, emoji: string, name: string) => void
  onRemoveCategory: (groupIndex: number, catIndex: number) => void
}) {
  const [drafting, setDrafting] = useState(false)
  const [emojiIndex, setEmojiIndex] = useState(0)
  const [newName, setNewName] = useState('')

  // Saving keeps the row open so several categories can be added in a row,
  // matching the mock's behaviour.
  const save = () => {
    if (!newName.trim()) return
    onAddCategory(index, EMOJI_CHOICES[emojiIndex], newName)
    setNewName('')
  }

  const cancel = () => {
    setDrafting(false)
    setNewName('')
  }

  return (
    <div className="cat-group">
      <div className="cat-group-header">
        <GroupName name={group.name} onRename={(name) => onRenameGroup(index, name)} />
        <span className="cat-group-count">
          {group.cats.length} {group.cats.length === 1 ? 'category' : 'categories'}
        </span>
      </div>

      {group.cats.map((cat, catIndex) => (
        <div key={cat.name + catIndex} className="cat-row">
          <DragHandleIcon />
          <span className="cat-row-emoji">{cat.emoji}</span>
          <span className="cat-row-name">{cat.name}</span>
          {cat.custom && <span className="cat-row-custom">Custom</span>}
          <div
            className="cat-row-delete"
            title={`Delete ${cat.name}`}
            onClick={() => onRemoveCategory(index, catIndex)}
          >
            <TrashIcon />
          </div>
        </div>
      ))}

      {drafting && (
        <div className="cat-draft">
          <div className="cat-draft-emoji">
            {EMOJI_CHOICES.map((emoji, i) => (
              <div
                key={emoji}
                className={`cat-emoji-swatch${emojiIndex === i ? ' active' : ''}`}
                onClick={() => setEmojiIndex(i)}
              >
                {emoji}
              </div>
            ))}
          </div>
          <input
            className="cat-draft-input"
            placeholder="Category name"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') cancel()
            }}
          />
          <div className="cat-draft-save" onClick={save}>
            Save
          </div>
          <div className="cat-draft-cancel" onClick={cancel}>
            Cancel
          </div>
        </div>
      )}

      <div className="cat-create" onClick={() => setDrafting(true)}>
        Create Category
      </div>
    </div>
  )
}

export function CategorySettings({
  groups,
  onAddGroup,
  onRenameGroup,
  onAddCategory,
  onRemoveCategory,
}: CategorySettingsProps) {
  return (
    <>
      <div className="cat-banner">
        <InfoIcon />
        <span>
          Changes you make to groups and categories here apply everywhere in Alder. Customize the structure to
          fit how you actually spend.
        </span>
      </div>

      {SECTIONS.map(({ section, label }) => (
        <div key={section} className="cat-section">
          <div className="cat-section-header">
            <span className="cat-section-title">{label}</span>
            <span className="cat-section-create" onClick={() => onAddGroup(section)}>
              Create group
            </span>
          </div>

          {groups.map((group, index) =>
            group.section === section ? (
              <GroupCard
                key={group.name + index}
                group={group}
                index={index}
                onRenameGroup={onRenameGroup}
                onAddCategory={onAddCategory}
                onRemoveCategory={onRemoveCategory}
              />
            ) : null,
          )}
        </div>
      ))}
    </>
  )
}
