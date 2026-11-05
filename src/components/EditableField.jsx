import { useState } from 'react'

export default function EditableField({ value, onSave, type = 'text', options = null, placeholder = '', editMode = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  const commit = async () => {
    if (draft === value) { setEditing(false); return }
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  const cancel = () => { setDraft(value ?? ''); setEditing(false) }

  const startEditing = () => { setDraft(value ?? ''); setEditing(true) }

  if (!editing) {
    const isEmpty = value === null || value === undefined || value === ''
    return (
      <span
        onClick={startEditing}
        title="Click to edit"
        className={`-ml-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-1.5 py-0.5 transition-colors hover:border-[#95D5B2] hover:bg-surface2 ${
          editMode ? 'border-borderStrong bg-[#F8FCFA]' : 'border-transparent'
        }`}
      >
        {isEmpty ? <span className="italic text-muted">{placeholder || 'Add…'}</span> : value}
        <span className={`text-[11px] text-muted transition-opacity ${editMode ? 'opacity-100' : 'opacity-0'}`}>✏️</span>
      </span>
    )
  }

  const inputClass = 'min-w-[160px] rounded-[7px] border border-primary bg-surface px-2.5 py-1 text-sm text-text focus:outline-none'

  return (
    <span className="inline-flex items-center gap-1.5">
      {options ? (
        <select autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className={inputClass}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className={`${inputClass} w-full resize-y`}
        />
      ) : (
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
          className={inputClass}
        />
      )}
      <button
        onClick={commit}
        disabled={saving}
        className="rounded-[6px] bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
      >
        {saving ? '…' : '✓'}
      </button>
      <button
        onClick={cancel}
        className="rounded-[6px] border border-border bg-surface px-2.5 py-1 text-xs text-muted hover:bg-surface2"
      >
        ✕
      </button>
    </span>
  )
}
