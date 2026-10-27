import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import {
  todayStr,
  formatDisplay,
  addDays,
  isToday,
  isYesterday,
  formatRelativeDisplay
} from '../lib/dateUtils'
import { priceOn, dayTotal, mealPriceFor, hasOverride } from '../lib/calc'
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  EditIcon,
  BreakfastIcon,
  LunchIcon,
  DinnerIcon
} from './Icons'
import { Receipt } from 'lucide-react'
import OverrideEditor from './OverrideEditor'

const MEALS = [
  { key: 'breakfast', label: 'Breakfast', Icon: BreakfastIcon, iconBg: 'bg-amber-50 border-amber-100 text-amber-500' },
  { key: 'lunch', label: 'Lunch', Icon: LunchIcon, iconBg: 'bg-blue-50 border-blue-100 text-primary' },
  { key: 'dinner', label: 'Dinner', Icon: DinnerIcon, iconBg: 'bg-indigo-50 border-indigo-100 text-indigo-600' }
]

function blankEntry() {
  return { breakfast: false, lunch: false, dinner: false, overrides: {}, mealNotes: {}, note: '' }
}

export default function Today({ uid, selectedDate, onDateChange }) {
  const [internalDate, setInternalDate] = useState(todayStr())
  const date = selectedDate || internalDate

  const setDate = (newDate) => {
    if (onDateChange) {
      onDateChange(newDate)
    } else {
      setInternalDate(newDate)
    }
  }

  const [entry, setEntry] = useState(blankEntry())
  const [mealPrices, setMealPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingMeal, setEditingMeal] = useState(null) // mealKey | null
  const [editSaving, setEditSaving] = useState(false)
  const [toast, setToast] = useState(null)

  // Listen to meal prices so price badges update live
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users', uid, 'mealPrices'), (snap) => {
      setMealPrices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [uid])

  // Load entry for the active date
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const ref = doc(db, 'users', uid, 'dailyEntries', date)
      const snap = await getDoc(ref)
      if (!cancelled) {
        if (snap.exists()) {
          const data = snap.data()
          setEntry({
            ...blankEntry(),
            ...data,
            overrides: { ...(data.overrides || {}) },
            mealNotes: { ...(data.mealNotes || {}) }
          })
        } else {
          setEntry(blankEntry())
        }
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [uid, date])

  async function saveEntry(next, prevForRevert) {
    setEntry(next)
    setSaving(true)
    try {
      const ref = doc(db, 'users', uid, 'dailyEntries', date)
      await setDoc(ref, next, { merge: true })
    } catch (err) {
      console.error('Failed to save entry', err)
      if (prevForRevert) setEntry(prevForRevert)
      alert('Could not save — check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  function toggle(mealKey) {
    const prev = entry
    saveEntry({ ...entry, [mealKey]: !entry[mealKey] }, prev)
  }

  function markAll(value) {
    const prev = entry
    saveEntry({ ...entry, breakfast: value, lunch: value, dinner: value }, prev)
  }

  async function saveOverride({ price, note }) {
    if (!editingMeal) return
    setEditSaving(true)
    const prev = entry
    try {
      const nextOverrides = { ...(entry.overrides || {}) }
      const nextNotes = { ...(entry.mealNotes || {}) }
      if (price === null || price === undefined) {
        delete nextOverrides[editingMeal]
        delete nextNotes[editingMeal]
      } else {
        nextOverrides[editingMeal] = price
        if (note !== undefined) {
          if (note) nextNotes[editingMeal] = note
          else delete nextNotes[editingMeal]
        }
      }
      // migrate legacy single note away once per-meal notes are in use
      const next = { ...entry, overrides: nextOverrides, mealNotes: nextNotes, note: '' }
      // Ensure doc exists even if no meal toggled yet (override alone should persist)
      const ref = doc(db, 'users', uid, 'dailyEntries', date)
      await setDoc(ref, next, { merge: true })
      setEntry(next)
      setEditingMeal(null)
      setToast(price === null || price === undefined ? 'Reset to mess rate.' : `Saved custom price for ${editingMeal}.`)
      setTimeout(() => setToast(null), 3500)
    } catch (err) {
      console.error('Failed to save override', err)
      setEntry(prev)
      alert('Could not save custom price — check your connection and try again.')
    } finally {
      setEditSaving(false)
    }
  }

  async function resetOverride() {
    if (!editingMeal) return
    await saveOverride({ price: null, note: '' })
  }

  async function resetDay() {
    const prev = entry
    const next = { ...entry, overrides: {}, mealNotes: {}, note: '' }
    setEntry(next)
    setSaving(true)
    try {
      const ref = doc(db, 'users', uid, 'dailyEntries', date)
      await setDoc(ref, next, { merge: true })
      setEditingMeal(null)
      setToast('All custom prices cleared for this day.')
      setTimeout(() => setToast(null), 3500)
    } catch (err) {
      console.error('Failed to reset day', err)
      setEntry(prev)
      alert('Could not reset — check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const effectivePrice = priceOn(date, mealPrices)
  const total = dayTotal(date, entry, mealPrices)
  const dayHasOverride = hasOverride(entry)
  const recordedCount = (entry.breakfast ? 1 : 0) + (entry.lunch ? 1 : 0) + (entry.dinner ? 1 : 0)

  const editingInfo = editingMeal
    ? mealPriceFor(date, editingMeal, entry, mealPrices)
    : null
  const editingLabel = editingMeal
    ? MEALS.find((m) => m.key === editingMeal)?.label || editingMeal
    : ''

  return (
    <div className="px-4 pt-3 pb-8 flex flex-col justify-start">
      {/* Header Section */}
      <section className="mb-4">
        <h2 className="text-2xl font-headline font-bold tracking-tight text-slate-900">Record Your Meals</h2>
        <p className="text-slate-500 text-sm mt-0.5">Tap to mark the meals you had today.</p>
      </section>

      {/* Date Selector Bar */}
      <div className="bg-white border border-slate-200/90 shadow-2xs px-3.5 py-2.5 flex items-center justify-between rounded-xl mb-3">
        <button
          type="button"
          onClick={() => setDate(addDays(date, -1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:scale-90 transition-all"
          title="Previous day"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>

        {/* Clickable Date with Hidden Date Picker */}
        <label className="relative cursor-pointer flex items-center gap-2 px-3 py-1 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200/60 transition-colors">
          <CalendarIcon className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800 tracking-tight">{formatDisplay(date)}</span>
          {isToday(date) ? (
            <span className="text-[11px] font-semibold bg-blue-50 text-primary border border-blue-100 px-2 py-0.5 rounded-full font-label">
              Today
            </span>
          ) : (
            <span className="text-[11px] font-medium text-slate-500">
              ({formatRelativeDisplay(date)})
            </span>
          )}
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>

        <button
          type="button"
          onClick={() => setDate(addDays(date, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:scale-90 transition-all"
          title="Next day"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Jump to Today indicator if viewing another date */}
      {!isToday(date) && (
        <div className="flex items-center justify-between bg-blue-50/70 border border-blue-100 text-slate-700 text-xs px-3.5 py-2 rounded-xl mb-3">
          <span>Viewing: <strong>{formatDisplay(date)}</strong></span>
          <button
            type="button"
            onClick={() => setDate(todayStr())}
            className="text-primary font-semibold hover:underline"
          >
            Jump to Today
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Loading meals for {formatDisplay(date)}…</div>
      ) : (
        <>
          {/* Daily Meal Cards Stack */}
          <section className="flex flex-col space-y-3 mb-4">
            {MEALS.map((m) => {
              const info = mealPriceFor(date, m.key, entry, mealPrices)
              const showPrice = effectivePrice !== null
              const isChecked = Boolean(entry[m.key])
              const MealIconComponent = m.Icon

              return (
                <div
                  key={m.key}
                  onClick={() => toggle(m.key)}
                  className={`group relative bg-white border-2 rounded-xl p-3.5 transition-all duration-150 cursor-pointer select-none ${
                    isChecked
                      ? 'border-primary/30 shadow-xs bg-white'
                      : 'border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0">
                      {/* Icon badge */}
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${m.iconBg}`}>
                        <MealIconComponent className="w-5 h-5" />
                      </div>

                      {/* Title & Price Pill */}
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-headline font-bold text-base text-slate-900 leading-tight">
                            {m.label}
                          </h3>
                          {showPrice && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-label tracking-tight tabular">
                              ₹{info.price.toFixed(2)}
                              {info.isOverride && <span className="ml-1 text-amber">•</span>}
                            </span>
                          )}
                        </div>
                        {(entry.mealNotes?.[m.key] || (entry.note && info.isOverride ? entry.note : '')) && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {entry.mealNotes?.[m.key] || entry.note}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Trailing Controls: Edit Custom Price + Checkbox */}
                    <div className="flex items-center space-x-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {showPrice && (
                        <button
                          type="button"
                          onClick={() => setEditingMeal(m.key)}
                          title={`Custom price for ${m.label} on ${formatDisplay(date)}`}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            info.isOverride
                              ? 'border-amber/40 bg-amber/10 text-amber'
                              : 'border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <EditIcon className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => toggle(m.key)}
                        title={`Toggle ${m.label}`}
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                          isChecked
                            ? 'bg-primary border-primary text-white shadow-xs'
                            : 'bg-slate-50 border-slate-300 text-transparent'
                        }`}
                      >
                        <CheckIcon className="w-4 h-4 stroke-[3]" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </section>

          {/* Daily Running Total Micro-Card */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 mb-4 flex items-center justify-between shadow-2xs">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium text-slate-600 font-label">Daily Running Bill</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-headline font-bold text-slate-900 tabular">
                Today's Total: ₹{total.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 font-medium font-label">
                {recordedCount} of 3 recorded
              </div>
            </div>
          </div>

          {/* Reset Custom Prices Banner if any */}
          {dayHasOverride && (
            <button
              type="button"
              onClick={resetDay}
              className="w-full mb-3 text-xs border border-due/30 bg-due/5 text-due rounded-xl py-2 font-semibold hover:bg-due/10 transition-colors"
            >
              Reset all custom prices for this day
            </button>
          )}

          {/* Dual Action Buttons Row */}
          <div className="flex items-center space-x-3 mb-2">
            <button
              type="button"
              onClick={() => markAll(true)}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 active:scale-98 text-slate-700 font-headline font-semibold text-sm transition-all text-center bg-white shadow-2xs"
            >
              Check all
            </button>
            <button
              type="button"
              onClick={() => markAll(false)}
              className="flex-1 py-3 px-6 rounded-xl bg-primary hover:bg-blue-600 text-white font-headline font-semibold text-sm shadow-md shadow-blue-500/20 active:scale-98 transition-all text-center flex items-center justify-center"
            >
              Clear all
            </button>
          </div>
        </>
      )}

      {/* Floating or Status Indicator */}
      <div className="min-h-5 mt-2 text-center">
        {saving && <p className="text-xs text-primary font-medium animate-pulse">Saving changes…</p>}
        {!saving && toast && <p className="text-xs text-slate-700 font-medium">{toast}</p>}
      </div>

      <OverrideEditor
        open={Boolean(editingMeal)}
        dateStr={date}
        mealLabel={editingLabel}
        basePrice={editingInfo?.base || 0}
        currentOverride={entry.overrides?.[editingMeal] ?? null}
        currentNote={entry.mealNotes?.[editingMeal] ?? (editingMeal && entry.overrides?.[editingMeal] !== undefined ? entry.note || '' : '')}
        saving={editSaving}
        onClose={() => setEditingMeal(null)}
        onSave={saveOverride}
        onReset={resetOverride}
        onResetDay={dayHasOverride ? resetDay : undefined}
        dayHasOverride={dayHasOverride}
      />
    </div>
  )
}
