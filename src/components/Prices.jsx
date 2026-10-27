import { useEffect, useState, useRef } from 'react'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query
} from 'firebase/firestore'
import { db } from '../firebase'
import { todayStr, formatDisplay } from '../lib/dateUtils'
import { EditIcon, TrashIcon } from './Icons'

export default function Prices({ uid }) {
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    effectiveFrom: todayStr(),
    breakfast: '',
    lunch: '',
    dinner: ''
  })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const formRef = useRef(null)

  useEffect(() => {
    const q = query(collection(db, 'users', uid, 'mealPrices'), orderBy('effectiveFrom', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setPrices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [uid])

  function startEdit(p) {
    setEditingId(p.id)
    setForm({
      effectiveFrom: p.effectiveFrom,
      breakfast: p.breakfast ?? '',
      lunch: p.lunch ?? '',
      dinner: p.dinner ?? ''
    })
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setForm({ effectiveFrom: todayStr(), breakfast: '', lunch: '', dinner: '' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.effectiveFrom) return
    setSaving(true)
    try {
      const payload = {
        effectiveFrom: form.effectiveFrom,
        breakfast: Number(form.breakfast) || 0,
        lunch: Number(form.lunch) || 0,
        dinner: Number(form.dinner) || 0
      }

      if (editingId) {
        const ref = doc(db, 'users', uid, 'mealPrices', editingId)
        await updateDoc(ref, payload)
        setEditingId(null)
      } else {
        await addDoc(collection(db, 'users', uid, 'mealPrices'), payload)
      }

      setForm({ effectiveFrom: todayStr(), breakfast: '', lunch: '', dinner: '' })
    } catch (err) {
      console.error('Failed to save price', err)
      alert('Could not save the price change — please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p) {
    const ok = window.confirm(
      `Are you sure you want to delete the price effective from ${formatDisplay(p.effectiveFrom)}?`
    )
    if (!ok) return

    setDeletingId(p.id)
    try {
      await deleteDoc(doc(db, 'users', uid, 'mealPrices', p.id))
      if (editingId === p.id) {
        cancelEdit()
      }
    } catch (err) {
      console.error('Failed to delete price', err)
      alert('Could not delete price entry — please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="px-4 pt-3 pb-8 flex flex-col justify-start">
      {/* Page Title & Subtitle */}
      <section className="mb-4">
        <h2 className="text-2xl font-headline font-bold tracking-tight text-slate-900">Meal Prices</h2>
        <p className="text-slate-500 text-sm mt-0.5">
          Set rates for meals. Prices apply from their effective date until changed.
        </p>
      </section>

      {/* Add / Edit Form Card */}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={`bg-white border rounded-2xl p-5 mb-6 shadow-xs transition-all ${
          editingId ? 'border-primary/50 ring-2 ring-primary/20' : 'border-slate-200/90'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-headline font-bold text-slate-900 flex items-center gap-2">
            {editingId ? (
              <>
                <EditIcon className="w-4 h-4 text-primary" />
                <span>Edit Price Entry</span>
              </>
            ) : (
              <span>Add Price Change</span>
            )}
          </p>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-slate-600 mb-1 font-label">
            Effective from
          </label>
          <input
            type="date"
            value={form.effectiveFrom}
            onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium tabular text-sm focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            required
          />
        </div>

        {/* 3-Column Rate Input Grid */}
        <div className="grid grid-cols-3 gap-2.5 mb-3.5">
          {['breakfast', 'lunch', 'dinner'].map((k) => (
            <div key={k}>
              <label className="block text-xs font-semibold text-slate-600 mb-1 capitalize font-label">
                {k} (₹)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-medium tabular text-sm focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-colors text-center"
                placeholder="0"
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
          {editingId
            ? `Editing affects every day from ${form.effectiveFrom || '—'} onwards (until a newer price is entered). Per-day custom prices stay untouched.`
            : 'New rates apply automatically from this effective date onwards until changed.'}
        </p>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-primary hover:bg-blue-600 active:scale-98 text-white py-3.5 px-4 rounded-xl font-headline font-bold text-sm shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : editingId ? 'Update Price Change' : 'Save Price Change'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 border border-slate-200 text-slate-700 hover:bg-slate-50 py-3.5 rounded-xl font-headline font-semibold text-sm transition-colors active:scale-98"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* History List Section */}
      <section>
        <div className="flex items-center justify-between mb-3 px-0.5">
          <h3 className="font-headline font-bold text-lg text-slate-900 tracking-tight">Price History</h3>
          <span className="font-label text-xs font-semibold bg-blue-50 text-primary border border-blue-100 px-2.5 py-0.5 rounded-full">
            {prices.length} {prices.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-400 text-sm">Loading prices…</div>
        ) : prices.length === 0 ? (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 text-center text-slate-500 text-sm shadow-2xs">
            No prices set yet — add one above to calculate meal bills.
          </div>
        ) : (
          <ul className="space-y-3">
            {prices.map((p) => {
              const isEditingThis = editingId === p.id
              const isDeletingThis = deletingId === p.id
              return (
                <li
                  key={p.id}
                  className={`bg-white border rounded-2xl p-4 shadow-2xs transition-all ${
                    isEditingThis ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200/90'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="text-slate-900 text-base font-headline font-bold block">
                        {formatDisplay(p.effectiveFrom)}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        Effective from this date onwards
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        disabled={isDeletingThis}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50 shadow-2xs"
                      >
                        <EditIcon className="w-3.5 h-3.5 text-slate-500" />
                        <span>{isEditingThis ? 'Editing…' : 'Edit'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p)}
                        disabled={isDeletingThis}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-due bg-white border border-due/30 rounded-lg hover:bg-due/5 active:scale-95 transition-all disabled:opacity-50 shadow-2xs"
                        title="Delete price entry"
                      >
                        <TrashIcon className="w-3.5 h-3.5 text-due" />
                        <span>{isDeletingThis ? 'Deleting…' : 'Delete'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-center">
                    <div className="bg-slate-50 rounded-xl py-2 px-1">
                      <span className="block text-[11px] font-medium text-slate-500 font-label">Breakfast</span>
                      <span className="font-headline font-bold text-sm text-slate-900 tabular">
                        ₹{Number(p.breakfast || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-slate-50 rounded-xl py-2 px-1">
                      <span className="block text-[11px] font-medium text-slate-500 font-label">Lunch</span>
                      <span className="font-headline font-bold text-sm text-slate-900 tabular">
                        ₹{Number(p.lunch || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-slate-50 rounded-xl py-2 px-1">
                      <span className="block text-[11px] font-medium text-slate-500 font-label">Dinner</span>
                      <span className="font-headline font-bold text-sm text-slate-900 tabular">
                        ₹{Number(p.dinner || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
