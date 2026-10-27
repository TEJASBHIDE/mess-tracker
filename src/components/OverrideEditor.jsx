import { useEffect, useState } from 'react'
import { formatDisplay } from '../lib/dateUtils'
import { CloseIcon } from './Icons'

// Props: open bool, dateStr, mealLabel, basePrice, currentOverride (number|null), currentNote,
//        saving bool, onClose, onSave({ price: number|null, note: string }), onReset
export default function OverrideEditor({
  open,
  dateStr,
  mealLabel,
  mealOptions,
  activeMealKey,
  onMealChange,
  basePrice,
  currentOverride,
  currentNote,
  saving,
  onClose,
  onSave,
  onReset,
  onResetDay,
  dayHasOverride
}) {
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setDraft(
        currentOverride !== null && currentOverride !== undefined && currentOverride !== ''
          ? String(currentOverride)
          : ''
      )
      setNote(currentNote || '')
    }
  }, [open, currentOverride, currentNote])

  if (!open) return null

  const parsed = draft === '' ? null : Number(draft)
  const valid = draft === '' || (Number.isFinite(parsed) && parsed >= 0)
  const unchanged =
    (parsed === null
      ? currentOverride === null || currentOverride === undefined || currentOverride === ''
      : Number(currentOverride) === parsed) && (note || '') === (currentNote || '')

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-headline font-bold text-slate-900">
            {mealLabel} · {dateStr ? formatDisplay(dateStr) : ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors active:scale-95"
            title="Close"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {mealOptions && onMealChange && (
          <div className="flex gap-1.5 mb-3.5">
            {mealOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => onMealChange(o.key)}
                className={`flex-1 py-1.5 text-xs rounded-xl font-label font-semibold transition-all active:scale-95 ${
                  o.key === activeMealKey
                    ? 'bg-primary text-white shadow-xs shadow-blue-500/20'
                    : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 mb-3 text-xs text-slate-600 flex items-center justify-between">
          <span>Standard rate: <strong className="tabular font-semibold text-slate-900">₹{Number(basePrice || 0).toFixed(2)}</strong></span>
          {currentOverride !== null && currentOverride !== undefined && currentOverride !== '' && (
            <span className="text-amber font-semibold">Custom: ₹{Number(currentOverride).toFixed(2)}</span>
          )}
        </div>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-slate-700 mb-1 font-label">
            Custom price for this day only (₹)
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`e.g. ${Number(basePrice || 0).toFixed(2)} — empty = mess rate`}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 tabular text-sm focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
          {!valid && <p className="text-xs text-due mt-1 font-medium">Enter 0 or more. Empty clears back to standard rate.</p>}
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1 font-label">
            Note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. extra chapati, half meal"
            maxLength={80}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 text-sm focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!valid || unchanged || saving}
            onClick={() => onSave({ price: parsed, note: note.trim() })}
            className="flex-1 bg-primary hover:bg-blue-600 active:scale-98 text-white py-3 px-4 rounded-xl font-headline font-bold text-sm shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save for this day'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 border border-slate-200 text-slate-700 hover:bg-slate-50 py-3 rounded-xl font-headline font-semibold text-sm transition-colors active:scale-98"
          >
            Cancel
          </button>
        </div>

        {currentOverride !== null && currentOverride !== undefined && currentOverride !== '' && (
          <button
            type="button"
            onClick={onReset}
            disabled={saving}
            className="w-full mt-2.5 text-xs border border-amber/40 bg-amber/5 text-amber-700 rounded-xl py-2 font-semibold hover:bg-amber/10 transition-colors disabled:opacity-50"
          >
            Reset to mess rate (₹{Number(basePrice || 0).toFixed(2)})
          </button>
        )}

        {dayHasOverride && onResetDay && (
          <button
            type="button"
            onClick={onResetDay}
            disabled={saving}
            className="w-full mt-2 text-xs border border-due/30 bg-due/5 text-due rounded-xl py-2 font-semibold hover:bg-due/10 transition-colors disabled:opacity-50"
          >
            Reset all 3 meals for this day
          </button>
        )}
      </div>
    </div>
  )
}
