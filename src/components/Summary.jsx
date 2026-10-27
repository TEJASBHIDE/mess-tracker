import { useEffect, useMemo, useRef, useState } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  documentId,
  onSnapshot
} from 'firebase/firestore'
import { db, auth } from '../firebase'
import {
  todayStr,
  defaultCycleFor,
  datesInRange,
  formatDisplay,
  isToday,
  isYesterday
} from '../lib/dateUtils'
import {
  sortCyclesAsc,
  findCoveringCycle,
  defaultCycleDoc
} from '../lib/cycles'
import { cycleTotal, dayTotal, mealPriceFor, hasOverride } from '../lib/calc'
import {
  downloadMealSummaryPdf,
  shareMealSummaryPdf
} from '../lib/pdfGenerator.js'
import {
  SettingsIcon,
  EditIcon,
  WalletIcon,
  QrCodeIcon,
  CopyIcon,
  CloseIcon,
  CheckIcon,
  CalendarIcon,
  ZapIcon,
  CheckCircleIcon
} from './Icons'
import { ChevronRight, Sparkles, FileText, Download, Loader2 } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa6'
import { TbReceiptRupee } from 'react-icons/tb'
import OverrideEditor from './OverrideEditor'

const MEAL_KEYS = [
  { key: 'breakfast', label: 'B', fullName: 'Breakfast' },
  { key: 'lunch', label: 'L', fullName: 'Lunch' },
  { key: 'dinner', label: 'D', fullName: 'Dinner' }
]

const POPULAR_HANDLES = ['@okaxis', '@okhdfcbank', '@oksbi', '@okicici', '@paytm', '@upi']

export default function Summary({ uid, onSelectDate }) {
  const [cycles, setCycles] = useState([])
  const [activeCycleId, setActiveCycleId] = useState(null)
  const [cyclesReady, setCyclesReady] = useState(false)
  const [activeReady, setActiveReady] = useState(false)
  const [initDone, setInitDone] = useState(false)
  const [editingMode, setEditingMode] = useState(null) // null | 'edit' | 'new'
  const [draftCycle, setDraftCycle] = useState({ startDate: '', endDate: '' })
  const [cycleBusy, setCycleBusy] = useState(false)
  const initRanRef = useRef(false)

  const [entries, setEntries] = useState({})
  const [mealPrices, setMealPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingDate, setSavingDate] = useState(null)
  const [overrideTarget, setOverrideTarget] = useState(null) // { date, meal } | null
  const [overrideSaving, setOverrideSaving] = useState(false)

  // Payment settings state
  const [paymentConfig, setPaymentConfig] = useState(null)
  const [editingPayment, setEditingPayment] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [draftPayment, setDraftPayment] = useState({
    payeeName: '',
    upiId: '',
    phoneNumber: ''
  })
  const [paymentError, setPaymentError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedUpi, setCopiedUpi] = useState(false)
  const [copiedAmount, setCopiedAmount] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)

  const sortedCycles = useMemo(() => sortCyclesAsc(cycles), [cycles])
  const cycle = useMemo(
    () => sortedCycles.find((c) => c.id === activeCycleId) || null,
    [sortedCycles, activeCycleId]
  )
  const activeIndex = useMemo(
    () => sortedCycles.findIndex((c) => c.id === activeCycleId),
    [sortedCycles, activeCycleId]
  )

  // 1a. Real-time list of all billing cycles (history)
  useEffect(() => {
    const q = query(collection(db, 'users', uid, 'billingCycles'), orderBy('startDate', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      setCycles(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setCyclesReady(true)
    })
    return unsub
  }, [uid])

  // 1b. Real-time active cycle pointer (backward compatible: settings/billingCycle holds start/end + cycleId)
  useEffect(() => {
    const ref = doc(db, 'users', uid, 'settings', 'billingCycle')
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setActiveCycleId(data.cycleId || null)
        // legacy doc without cycleId: keep dates in draft for migration step
        if (!data.cycleId && data.startDate && data.endDate) {
          setDraftCycle({ startDate: data.startDate, endDate: data.endDate })
        }
      } else {
        setActiveCycleId(null)
      }
      setActiveReady(true)
    })
    return unsub
  }, [uid])

  // 1c. One-time migration + auto-roll. Additive only — never deletes entries.
  useEffect(() => {
    if (!cyclesReady || !activeReady || initRanRef.current) return
    initRanRef.current = true
    ;(async () => {
      try {
        const today = todayStr()
        const cyclesSnap = await getDocs(collection(db, 'users', uid, 'billingCycles'))
        let list = cyclesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        const activeRef = doc(db, 'users', uid, 'settings', 'billingCycle')
        const activeSnap = await getDoc(activeRef)
        const activeData = activeSnap.exists() ? activeSnap.data() : null
        let pointerId = activeData?.cycleId || null

        async function setActivePointer(target) {
          await setDoc(
            activeRef,
            {
              startDate: target.startDate,
              endDate: target.endDate,
              cycleId: target.id,
              updatedAt: new Date().toISOString()
            },
            { merge: true }
          )
          pointerId = target.id
        }

        // Case A: brand new user — nothing stored anywhere
        if (list.length === 0 && !activeData) {
          const base = defaultCycleDoc(today)
          const added = await addDoc(collection(db, 'users', uid, 'billingCycles'), base)
          const target = { id: added.id, ...base }
          await setActivePointer(target)
        }
        // Case B: legacy single-cycle user — migrate old doc into history
        else if (list.length === 0 && activeData?.startDate && activeData?.endDate) {
          const base = {
            startDate: activeData.startDate,
            endDate: activeData.endDate,
            createdAt: new Date().toISOString(),
            migratedFromLegacy: true
          }
          const added = await addDoc(collection(db, 'users', uid, 'billingCycles'), base)
          list = [{ id: added.id, ...base }]
          pointerId = added.id
          // fall through to auto-roll check below with migrated list
        }

        // Refresh list if we just created the first entry
        if (list.length <= 1 && pointerId) {
          const fresh = await getDocs(collection(db, 'users', uid, 'billingCycles'))
          list = fresh.docs.map((d) => ({ id: d.id, ...d.data() }))
        }

        const sorted = sortCyclesAsc(list)
        let active = sorted.find((c) => c.id === pointerId) || null

        // Pointer missing/stale → point to cycle covering today, else latest
        if (!active && sorted.length > 0) {
          active = findCoveringCycle(sorted, today) || sorted[sorted.length - 1]
          await setActivePointer(active)
        }

        // Auto-roll: active expired AND no cycle covers today → start current month
        if (active && active.endDate < today) {
          const covering = findCoveringCycle(sorted, today)
          if (covering) {
            if (covering.id !== active.id) await setActivePointer(covering)
          } else {
            const base = defaultCycleDoc(today)
            const added = await addDoc(collection(db, 'users', uid, 'billingCycles'), base)
            await setActivePointer({ id: added.id, ...base })
          }
        }
      } catch (err) {
        console.error('Cycle init failed', err)
      } finally {
        setInitDone(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cyclesReady, activeReady, uid])

  // 2. Real-time listener for meal prices
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users', uid, 'mealPrices'), (snap) => {
      setMealPrices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [uid])

  // 3. Real-time listener for payment settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', uid, 'settings', 'payment'), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setPaymentConfig(data)
        setDraftPayment({
          payeeName: data.payeeName || '',
          upiId: data.upiId || '',
          phoneNumber: data.phoneNumber || ''
        })
      } else {
        // No hardcoded default: each user sets their own mess UPI.
        // Existing users with a saved doc keep working untouched.
        setPaymentConfig(null)
        setDraftPayment({ payeeName: '', upiId: '', phoneNumber: '' })
      }
    })
    return unsub
  }, [uid])

  // 4. Real-time listener for daily entries within the SELECTED cycle
  useEffect(() => {
    if (!cycle) return
    setLoading(true)

    const entriesQ = query(
      collection(db, 'users', uid, 'dailyEntries'),
      where(documentId(), '>=', cycle.startDate),
      where(documentId(), '<=', cycle.endDate)
    )

    const unsub = onSnapshot(entriesQ, (snap) => {
      const entriesByDate = {}
      snap.forEach((d) => {
        entriesByDate[d.id] = d.data()
      })
      setEntries(entriesByDate)
      setLoading(false)
    })

    return unsub
  }, [cycle, uid])

  const datesCache = cycle ? datesInRange(cycle.startDate, cycle.endDate) : []

  async function setActiveCycle(target) {
    const ref = doc(db, 'users', uid, 'settings', 'billingCycle')
    await setDoc(
      ref,
      {
        startDate: target.startDate,
        endDate: target.endDate,
        cycleId: target.id,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    )
    setActiveCycleId(target.id)
  }

  function openEdit() {
    if (editingMode === 'edit') {
      setEditingMode(null)
      return
    }
    if (!cycle) return
    setDraftCycle({ startDate: cycle.startDate, endDate: cycle.endDate })
    setEditingMode('edit')
  }

  function openNew() {
    if (editingMode === 'new') {
      setEditingMode(null)
      return
    }
    const d = defaultCycleFor(todayStr())
    // Suggest current month, but user can change to custom 21-20 style range
    setDraftCycle(d)
    setEditingMode('new')
  }

  async function saveCycleForm(e) {
    e.preventDefault()
    if (!draftCycle.startDate || !draftCycle.endDate) return
    if (draftCycle.startDate > draftCycle.endDate) {
      alert('Start date must be on or before end date.')
      return
    }
    setCycleBusy(true)
    try {
      if (editingMode === 'new') {
        const payload = {
          startDate: draftCycle.startDate,
          endDate: draftCycle.endDate,
          createdAt: new Date().toISOString()
        }
        const added = await addDoc(collection(db, 'users', uid, 'billingCycles'), payload)
        await setActiveCycle({ id: added.id, ...payload })
      } else if (editingMode === 'edit' && cycle) {
        const ref = doc(db, 'users', uid, 'billingCycles', cycle.id)
        await updateDoc(ref, {
          startDate: draftCycle.startDate,
          endDate: draftCycle.endDate
        })
        await setActiveCycle({ ...cycle, ...draftCycle })
      }
      setEditingMode(null)
    } catch (err) {
      console.error('Failed to save cycle', err)
      alert('Could not save cycle — please try again.')
    } finally {
      setCycleBusy(false)
    }
  }

  async function startCurrentMonth() {
    setCycleBusy(true)
    try {
      const today = todayStr()
      const covering = findCoveringCycle(sortedCycles, today)
      if (covering) {
        await setActiveCycle(covering)
      } else {
        const base = defaultCycleDoc(today)
        const added = await addDoc(collection(db, 'users', uid, 'billingCycles'), base)
        await setActiveCycle({ id: added.id, ...base })
      }
    } catch (err) {
      console.error('Failed to start current month', err)
      alert('Could not start current month — please try again.')
    } finally {
      setCycleBusy(false)
    }
  }

  function goNeighbour(dir) {
    if (activeIndex < 0) return
    const next = sortedCycles[activeIndex + dir]
    if (next) setActiveCycle(next).catch((err) => console.error('Cycle switch failed', err))
  }

  async function deleteSelectedCycle() {
    if (!cycle) return
    if (sortedCycles.length <= 1) {
      alert('You need at least one billing cycle — delete is disabled.')
      return
    }
    const ok = window.confirm(
      `Delete cycle ${formatDisplay(cycle.startDate)} – ${formatDisplay(cycle.endDate)}? Meal entries are kept, only the cycle grouping is removed.`
    )
    if (!ok) return
    setCycleBusy(true)
    try {
      await deleteDoc(doc(db, 'users', uid, 'billingCycles', cycle.id))
      const remaining = sortedCycles.filter((c) => c.id !== cycle.id)
      const fallback = findCoveringCycle(remaining, todayStr()) || remaining[remaining.length - 1]
      if (fallback) await setActiveCycle(fallback)
    } catch (err) {
      console.error('Failed to delete cycle', err)
      alert('Could not delete cycle — please try again.')
    } finally {
      setCycleBusy(false)
    }
  }

  function isValidUpi(v) {
    return /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test((v || '').trim())
  }

  async function savePaymentSettings(e) {
    e.preventDefault()
    const upi = (draftPayment.upiId || '').trim()
    if (!upi) {
      setPaymentError('Enter your mess UPI ID.')
      return
    }
    if (!isValidUpi(upi)) {
      setPaymentError('That UPI ID looks incomplete — it should look like name@okaxis. Pick a bank handle below or check spelling.')
      return
    }
    setPaymentError('')
    setSavingPayment(true)
    try {
      const cleanData = {
        payeeName: (draftPayment.payeeName || 'Mess').trim(),
        upiId: draftPayment.upiId.trim(),
        phoneNumber: (draftPayment.phoneNumber || '').trim()
      }
      const ref = doc(db, 'users', uid, 'settings', 'payment')
      await setDoc(ref, cleanData)
      setPaymentConfig(cleanData)
      setEditingPayment(false)
    } catch (err) {
      console.error('Failed to save payment settings', err)
      alert('Could not save payment details. Please try again.')
    } finally {
      setSavingPayment(false)
    }
  }

  async function removePayment() {
    const ok = window.confirm(
      'Remove mess UPI? Pay button and QR will hide until you set a new one. Totals stay safe.'
    )
    if (!ok) return
    setSavingPayment(true)
    try {
      await deleteDoc(doc(db, 'users', uid, 'settings', 'payment'))
      setPaymentConfig(null)
      setDraftPayment({ payeeName: '', upiId: '', phoneNumber: '' })
      setPaymentError('')
      setEditingPayment(false)
      setShowQrModal(false)
    } catch (err) {
      console.error('Failed to remove payment', err)
      alert('Could not remove — check your connection and try again.')
    } finally {
      setSavingPayment(false)
    }
  }
  function applyHandle(handle) {
    let base = (draftPayment.upiId || '').trim()
    if (base.includes('@')) {
      base = base.split('@')[0]
    }
    if (!base && draftPayment.phoneNumber) {
      base = draftPayment.phoneNumber.trim()
    }
    if (paymentError) setPaymentError('')
    setDraftPayment({
      ...draftPayment,
      upiId: `${base}${handle}`
    })
  }

  function shortCycleTag() {
    if (!cycle) return 'Mess'
    const s = new Date(cycle.startDate + 'T00:00:00')
    const label = s.toLocaleDateString('en-IN', { month: 'short' }) + String(s.getFullYear()).slice(2)
    return `Mess ${label}`
  }

  function fullBillNote() {
    if (!cycle) return 'Mess Bill'
    return `Mess Bill (${formatDisplay(cycle.startDate)}-${formatDisplay(cycle.endDate)})`
  }

  function paymentAmountStr(amount) {
    const n = Number(amount) || 0
    return Number.isInteger(n) ? String(n) : n.toFixed(2)
  }

  function getUpiUrl(amount, { withAmount = true, ref = null } = {}) {
    if (!paymentConfig?.upiId) return ''
    const pa = paymentConfig.upiId.trim()
    const pn = encodeURIComponent((paymentConfig.payeeName || 'Mess').trim())
    const tn = encodeURIComponent(fullBillNote())
    // Unique ref per payment attempt so rapid retries don't look like duplicate spam
    const tr = encodeURIComponent(
      ref || `Mess${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
    )
    if (!withAmount) {
      return `upi://pay?pa=${pa}&pn=${pn}&cu=INR&tn=${tn}&tr=${tr}`
    }
    const am = encodeURIComponent(paymentAmountStr(amount))
    return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}&tr=${tr}`
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      alert(`Copied: ${text}`)
    }
  }

  async function toggleMeal(dateStr, mealKey) {
    const currentEntry = entries[dateStr] || { breakfast: false, lunch: false, dinner: false, overrides: {}, mealNotes: {}, note: '' }
    const updated = {
      ...currentEntry,
      overrides: { ...(currentEntry.overrides || {}) },
      [mealKey]: !currentEntry[mealKey]
    }

    setEntries((prev) => ({
      ...prev,
      [dateStr]: updated
    }))
    setSavingDate(dateStr)

    try {
      const ref = doc(db, 'users', uid, 'dailyEntries', dateStr)
      await setDoc(ref, updated, { merge: true })
    } catch (err) {
      console.error('Failed to update meal from summary', err)
      setEntries((prev) => ({
        ...prev,
        [dateStr]: currentEntry
      }))
      alert('Could not update meal — please check your internet connection.')
    } finally {
      setSavingDate(null)
    }
  }

  function mealNoteOf(dayEntry, mealKey) {
    if (!dayEntry) return ''
    if (dayEntry.mealNotes?.[mealKey]) return dayEntry.mealNotes[mealKey]
    if (dayEntry.overrides?.[mealKey] !== undefined && dayEntry.overrides?.[mealKey] !== null && dayEntry.overrides?.[mealKey] !== '' && dayEntry.note) return dayEntry.note
    return ''
  }

  async function saveDayOverride({ price, note }) {
    if (!overrideTarget) return
    const { date: dateStr } = overrideTarget
    const mealKey = overrideTarget.meal
    setOverrideSaving(true)
    const prev = entries[dateStr]
    try {
      const base = entries[dateStr] || { breakfast: false, lunch: false, dinner: false, overrides: {}, mealNotes: {}, note: '' }
      const nextOverrides = { ...(base.overrides || {}) }
      const nextNotes = { ...(base.mealNotes || {}) }
      if (price === null || price === undefined) {
        delete nextOverrides[mealKey]
        delete nextNotes[mealKey]
      } else {
        nextOverrides[mealKey] = price
        if (note !== undefined) {
          if (note) nextNotes[mealKey] = note
          else delete nextNotes[mealKey]
        }
      }
      const next = { ...base, overrides: nextOverrides, mealNotes: nextNotes, note: '' }
      setEntries((old) => ({ ...old, [dateStr]: next }))
      const ref = doc(db, 'users', uid, 'dailyEntries', dateStr)
      await setDoc(ref, next, { merge: true })
      setOverrideTarget(null)
    } catch (err) {
      console.error('Failed to save day override', err)
      if (prev) setEntries((old) => ({ ...old, [dateStr]: prev }))
      alert('Could not save custom price — check your connection and try again.')
    } finally {
      setOverrideSaving(false)
    }
  }

  async function resetDayOverride() {
    if (!overrideTarget) return
    await saveDayOverride({ price: null, note: '' })
  }

  async function resetWholeDay(dateStr) {
    const prev = entries[dateStr]
    const base = prev || { breakfast: false, lunch: false, dinner: false, overrides: {}, note: '' }
    const next = { ...base, overrides: {}, mealNotes: {}, note: '' }
    setEntries((old) => ({ ...old, [dateStr]: next }))
    try {
      const ref = doc(db, 'users', uid, 'dailyEntries', dateStr)
      await setDoc(ref, next, { merge: true })
      setOverrideTarget(null)
    } catch (err) {
      console.error('Failed to reset day', err)
      if (prev) setEntries((old) => ({ ...old, [dateStr]: prev }))
      alert('Could not reset — check your connection and try again.')
    }
  }

  if (!initDone || !cycle || loading) {
    return <div className="min-h-screen bg-paper flex items-center justify-center text-inkSoft">Loading…</div>
  }

  const total = cycleTotal(datesCache, entries, mealPrices)
  const daysEaten = datesCache.filter(
    (d) => entries[d] && (entries[d].breakfast || entries[d].lunch || entries[d].dinner)
  ).length
  const todayUncovered =
    sortedCycles.length === 0 || !findCoveringCycle(sortedCycles, todayStr())

  function openQr() {
    setQrUrl(getUpiUrl(total))
    setShowQrModal(true)
  }

  function payNow() {
    // Fresh unique ref per tap so banks don't flag rapid retries as duplicates
    window.location.href = getUpiUrl(total)
  }

  function payWithoutAmount() {
    window.location.href = getUpiUrl(total, { withAmount: false })
  }

  async function copyUpiOnly() {
    const text = paymentConfig?.upiId || ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedUpi(true)
      setTimeout(() => setCopiedUpi(false), 2000)
    } catch {
      alert(text)
    }
  }

  async function copyAmountOnly() {
    const text = paymentAmountStr(total)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAmount(true)
      setTimeout(() => setCopiedAmount(false), 2000)
    } catch {
      alert(text)
    }
  }

  async function copyAmountFlow() {
    const text = `UPI: ${paymentConfig?.upiId || ''}\nAmount: Rs.${paymentAmountStr(total)}\nNote: ${fullBillNote()}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAmount(true)
      setTimeout(() => setCopiedAmount(false), 2500)
    } catch {
      alert(text)
    }
  }

  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [pdfSuccess, setPdfSuccess] = useState('')

  async function handleDownloadPdf() {
    setPdfGenerating(true)
    setPdfSuccess('')
    try {
      const user = auth.currentUser || { displayName: 'Student', email: '' }
      downloadMealSummaryPdf({
        user,
        cycle,
        dates: datesCache,
        entries,
        mealPrices,
        paymentConfig
      })
      setPdfSuccess('Downloaded!')
      setTimeout(() => setPdfSuccess(''), 3000)
    } catch (err) {
      console.error('Failed to download PDF:', err)
      alert('Could not generate PDF. Please try again.')
    } finally {
      setPdfGenerating(false)
    }
  }

  async function handleShareWhatsApp() {
    setPdfGenerating(true)
    setPdfSuccess('')
    try {
      const user = auth.currentUser || { displayName: 'Student', email: '' }
      const res = await shareMealSummaryPdf({
        user,
        cycle,
        dates: datesCache,
        entries,
        mealPrices,
        paymentConfig
      })
      if (res?.success) {
        setPdfSuccess('Shared!')
        setTimeout(() => setPdfSuccess(''), 3000)
      }
    } catch (err) {
      console.error('Failed to share PDF:', err)
      alert('Could not share PDF. Please try again.')
    } finally {
      setPdfGenerating(false)
    }
  }

  return (
    <div className="px-4 pt-3 pb-8 flex flex-col justify-start">
      {/* Page Title & Date Range */}
      <section className="mb-4">
        <h2 className="text-2xl font-headline font-bold text-slate-900 tracking-tight">Billing Summary</h2>
        <p className="text-slate-500 text-sm mt-0.5 font-medium flex items-center gap-1.5 font-label">
          <CalendarIcon className="w-4 h-4 text-slate-400" />
          <span>{formatDisplay(cycle.startDate)} – {formatDisplay(cycle.endDate)}</span>
        </p>
      </section>

      {/* Hero Total Payable Card */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-4 transition-all">
        {/* Centered Top Badge */}
        <div className="flex justify-center">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100/80 flex items-center justify-center text-primary shadow-2xs">
            <TbReceiptRupee className="w-6 h-6 text-primary" />
          </div>
        </div>

        {/* Label */}
        <p className="text-slate-500 font-semibold text-xs text-center mt-2.5 uppercase tracking-wider font-label">
          Total Payable
        </p>

        {/* Hero Figure */}
        <div className="text-center my-1">
          <span className="font-headline text-3xl font-extrabold text-slate-900 tracking-tight tabular">
            ₹{total.toFixed(2)}
          </span>
        </div>

        {/* Subtext */}
        <p className="text-slate-500 text-xs text-center mb-4 font-medium flex items-center justify-center gap-1">
          <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
          <span>{daysEaten} days with meals recorded</span>
        </p>

        {/* Primary Pay CTA Button (opens UPI app to payee without amount to bypass bank security limits) */}
        {total > 0 && (
          <button
            type="button"
            onClick={paymentConfig?.upiId ? payWithoutAmount : () => {
              setDraftPayment({ payeeName: '', upiId: '', phoneNumber: '' })
              setPaymentError('')
              setEditingPayment(true)
            }}
            className="w-full bg-primary hover:bg-blue-600 active:scale-98 text-white font-headline font-bold text-sm py-3.5 px-4 rounded-xl shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition duration-150 mb-2.5"
          >
            <ZapIcon className="w-4 h-4" />
            <span>Pay ₹{paymentAmountStr(total)} via UPI</span>
          </button>
        )}

        {/* Dedicated Quick-Copy Buttons */}
        {total > 0 && paymentConfig?.upiId && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              type="button"
              onClick={copyAmountOnly}
              className={`py-2 px-3 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-2xs ${
                copiedAmount
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
            >
              {copiedAmount ? (
                <>
                  <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <CopyIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy ₹{paymentAmountStr(total)}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={copyUpiOnly}
              className={`py-2 px-3 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-2xs ${
                copiedUpi
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
            >
              {copiedUpi ? (
                <>
                  <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <CopyIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy UPI</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Recipient Target Box */}
        {paymentConfig?.upiId ? (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <p className="font-semibold text-slate-800 text-xs truncate">
                {paymentConfig.payeeName || 'Mess'}
              </p>
              <p className="text-[11px] text-slate-500 truncate font-mono mt-0.5">
                {paymentConfig.upiId}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setDraftPayment({
                    payeeName: paymentConfig.payeeName || '',
                    upiId: paymentConfig.upiId || '',
                    phoneNumber: paymentConfig.phoneNumber || ''
                  })
                  setPaymentError('')
                  setEditingPayment(true)
                }}
                className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition active:scale-95 shadow-2xs"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={openQr}
                className="px-2.5 py-1.5 text-[11px] font-semibold text-primary bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition active:scale-95 flex items-center gap-1 shadow-2xs"
              >
                <QrCodeIcon className="w-3.5 h-3.5" />
                <span>QR</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftPayment({ payeeName: '', upiId: '', phoneNumber: '' })
              setPaymentError('')
              setEditingPayment(true)
            }}
            className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 text-primary font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <WalletIcon className="w-4 h-4" />
            <span>Set up Mess UPI to enable instant payment</span>
          </button>
        )}
      </section>

      {/* Mess Owner Bill Slip & PDF Actions */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4 transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-primary flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-headline font-bold text-xs text-slate-900">
                Mess Owner Bill Slip (PDF)
              </h3>
              <p className="text-[11px] text-slate-500 font-body">
                Clean attendance register designed for quick verification
              </p>
            </div>
          </div>
          {pdfSuccess && (
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 animate-in fade-in">
              ✓ {pdfSuccess}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Share on WhatsApp button */}
          <button
            type="button"
            onClick={handleShareWhatsApp}
            disabled={pdfGenerating}
            className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-headline font-bold text-xs py-2.5 px-3 rounded-xl shadow-xs shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
            title="Send PDF to mess owner on WhatsApp"
          >
            {pdfGenerating ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : (
              <FaWhatsapp className="w-4 h-4 text-white" />
            )}
            <span>{pdfGenerating ? 'Generating...' : 'Send on WhatsApp'}</span>
          </button>

          {/* Download PDF button */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfGenerating}
            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 active:scale-98 font-headline font-bold text-xs py-2.5 px-3 rounded-xl shadow-2xs flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
            title="Download PDF bill to device"
          >
            {pdfGenerating ? (
              <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
            ) : (
              <Download className="w-4 h-4 text-slate-600" />
            )}
            <span>Download PDF</span>
          </button>
        </div>
      </section>

      {/* Billing Cycle Settings Banner / Row */}
      <div className="bg-white rounded-xl p-3.5 border border-slate-100 flex flex-col shadow-2xs mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-primary flex items-center justify-center shrink-0">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-xs text-slate-800 leading-tight">Billing Period</p>
              <p className="text-[11px] text-slate-400">{sortedCycles.length} cycle{sortedCycles.length === 1 ? '' : 's'} recorded</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => goNeighbour(-1)}
              disabled={activeIndex <= 0 || cycleBusy}
              className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30 text-xs"
              title="Previous cycle"
            >
              ‹
            </button>
            <select
              value={activeCycleId || ''}
              onChange={(e) => {
                const target = sortedCycles.find((c) => c.id === e.target.value)
                if (target) setActiveCycle(target).catch((err) => console.error(err))
              }}
              className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 bg-white font-medium max-w-[160px] truncate"
            >
              {sortedCycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatDisplay(c.startDate)} – {formatDisplay(c.endDate)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => goNeighbour(1)}
              disabled={activeIndex < 0 || activeIndex >= sortedCycles.length - 1 || cycleBusy}
              className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30 text-xs"
              title="Next cycle"
            >
              ›
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={openNew}
            className="flex-1 text-xs font-semibold border border-slate-200 text-slate-700 rounded-lg py-1.5 hover:bg-slate-50 transition-colors"
          >
            {editingMode === 'new' ? 'Close' : '+ New Cycle'}
          </button>
          <button
            type="button"
            onClick={openEdit}
            className="flex-1 text-xs font-semibold border border-slate-200 text-slate-700 rounded-lg py-1.5 hover:bg-slate-50 transition-colors"
          >
            {editingMode === 'edit' ? 'Close' : 'Edit Dates'}
          </button>
          {sortedCycles.length > 1 && (
            <button
              type="button"
              onClick={deleteSelectedCycle}
              disabled={cycleBusy}
              className="text-xs font-semibold px-2.5 py-1.5 border border-due/30 text-due rounded-lg hover:bg-due/5 disabled:opacity-50 transition-colors"
            >
              Delete
            </button>
          )}
        </div>

        {todayUncovered && (
          <button
            type="button"
            onClick={startCurrentMonth}
            disabled={cycleBusy}
            className="w-full mt-2 text-xs bg-blue-50 border border-blue-100 text-primary rounded-lg py-2 font-semibold hover:bg-blue-100/70 disabled:opacity-50 transition-colors"
          >
            {cycleBusy ? 'Working…' : `Start current month (${formatDisplay(defaultCycleFor(todayStr()).startDate)} – ${formatDisplay(defaultCycleFor(todayStr()).endDate)})`}
          </button>
        )}
      </div>

      {/* Cycle create/edit form */}
      {editingMode && (
        <form onSubmit={saveCycleForm} className="bg-white border border-primary/40 rounded-2xl p-4 mb-4 space-y-3 ring-2 ring-primary/10 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold font-headline text-slate-900">{editingMode === 'new' ? 'New Billing Cycle' : 'Edit Billing Cycle'}</p>
            <button type="button" onClick={() => setEditingMode(null)} className="text-slate-400 hover:text-slate-700 p-1">
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 font-label">Start Date</label>
              <input
                type="date"
                value={draftCycle.startDate}
                onChange={(e) => setDraftCycle({ ...draftCycle, startDate: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-900 tabular text-xs"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 font-label">End Date</label>
              <input
                type="date"
                value={draftCycle.endDate}
                onChange={(e) => setDraftCycle({ ...draftCycle, endDate: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-900 tabular text-xs"
                required
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={cycleBusy}
              className="flex-1 bg-primary text-white py-2.5 rounded-xl font-bold text-xs hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {cycleBusy ? 'Saving…' : editingMode === 'new' ? 'Create & Switch' : 'Save Dates'}
            </button>
            <button
              type="button"
              onClick={() => {
                const d = defaultCycleFor(todayStr())
                setDraftCycle(d)
              }}
              className="px-3 border border-slate-200 text-slate-700 py-2.5 rounded-xl font-medium text-xs hover:bg-slate-50 transition-colors"
            >
              Reset to Month
            </button>
          </div>
        </form>
      )}

      {/* Day by Day Breakdown with Quick Toggles */}
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h3 className="font-headline font-bold text-lg text-slate-900 tracking-tight">Day-by-Day Meals</h3>
        <span className="text-xs text-slate-400 font-normal">Tap B, L, D to toggle</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100 mb-4">
        {datesCache.map((d) => {
          const e = entries[d] || { breakfast: false, lunch: false, dinner: false }
          const t = dayTotal(d, e, mealPrices)
          const isCurrToday = isToday(d)
          const isCurrYesterday = isYesterday(d)
          const hasMeals = Boolean(e.breakfast || e.lunch || e.dinner)

          return (
            <div
              key={d}
              className={`p-3.5 flex items-center justify-between hover:bg-slate-50/70 transition-colors ${
                isCurrToday ? 'bg-blue-50/20' : ''
              }`}
            >
              {/* Date & Tag */}
              <div className="space-y-0.5 min-w-0 pr-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`font-headline font-semibold text-sm ${isCurrToday ? 'text-primary font-bold' : 'text-slate-800'}`}>
                    {formatDisplay(d)}
                  </span>
                  {isCurrToday && (
                    <span className="text-[10px] font-semibold bg-blue-50 text-primary border border-blue-100 px-1.5 py-0.2 rounded-full font-label">
                      Today
                    </span>
                  )}
                  {isCurrYesterday && (
                    <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-full font-label">
                      Yesterday
                    </span>
                  )}
                </div>

                {/* Day Cost */}
                <div className="text-xs font-bold text-slate-900 tabular">
                  {hasMeals ? (
                    <button
                      type="button"
                      onClick={() => {
                        const firstOn = MEAL_KEYS.find((k) => e[k.key])?.key || 'lunch'
                        setOverrideTarget({ date: d, meal: firstOn })
                      }}
                      className="font-bold text-slate-900 hover:text-primary transition-colors inline-flex items-center gap-1"
                      title="Custom price for this day"
                    >
                      <span>₹{t.toFixed(2)}</span>
                      {hasOverride(e) && <span className="text-amber">•</span>}
                      {t === 0 && (
                        <span className="text-due text-[10px] font-normal">(No price)</span>
                      )}
                    </button>
                  ) : (
                    <span className="text-slate-400 font-normal">No meals logged</span>
                  )}
                </div>
              </div>

              {/* Quick Meal Toggles: B, L, D */}
              <div className="flex items-center gap-1.5 shrink-0">
                {MEAL_KEYS.map((m) => {
                  const active = Boolean(e[m.key])
                  const ov = mealPriceFor(d, m.key, e, mealPrices)
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggleMeal(d, m.key)}
                      onContextMenu={(ev) => {
                        ev.preventDefault()
                        setOverrideTarget({ date: d, meal: m.key })
                      }}
                      onDoubleClick={() => setOverrideTarget({ date: d, meal: m.key })}
                      title={mealNoteOf(e, m.key) ? `${m.fullName} · custom: ${mealNoteOf(e, m.key)} (double-tap to edit)` : `Toggle ${m.fullName} for ${formatDisplay(d)}`}
                      className={`w-7 h-7 rounded-lg text-xs font-semibold transition active:scale-95 flex items-center justify-center relative ${
                        active
                          ? 'bg-primary text-white shadow-xs shadow-blue-500/20'
                          : 'border border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {m.label}
                      {ov.isOverride && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber border-2 border-white" />
                      )}
                    </button>
                  )
                })}

                {/* Custom price for this day */}
                <button
                  type="button"
                  onClick={() => {
                    const firstOn = MEAL_KEYS.find((k) => e[k.key])?.key || 'lunch'
                    setOverrideTarget({ date: d, meal: firstOn })
                  }}
                  title={`Custom price for ${formatDisplay(d)}`}
                  className={`text-xs font-bold px-1.5 py-1 rounded-lg hover:bg-slate-100 transition active:scale-95 ${
                    hasOverride(e) ? 'text-amber' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  ₹
                </button>

                {/* Jump to Full Editor */}
                {onSelectDate && (
                  <button
                    type="button"
                    onClick={() => onSelectDate(d)}
                    title="Open full day editor"
                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition active:scale-95"
                  >
                    <EditIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {savingDate && (
        <p className="text-xs text-primary font-medium mt-2 mb-3 text-center animate-pulse">
          Updating meal data…
        </p>
      )}

      {/* Breakdown Summary Mini Card */}
      <section className="mt-2 mb-4 bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-2">
        <h4 className="font-headline font-bold text-sm text-slate-900 tracking-tight">Cycle Calculation Breakdown</h4>
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>Total Cycle Duration</span>
          <span className="font-semibold text-slate-800">{datesCache.length} days</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Days with Meals Recorded</span>
          <span className="font-semibold text-slate-800">{daysEaten} days</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <span className="font-medium text-slate-700">Total Net Amount Payable</span>
          <span className="font-headline font-bold text-sm text-primary tabular">₹{total.toFixed(2)}</span>
        </div>
      </section>

      {/* Modal: per-day price override */}
      <OverrideEditor
        open={Boolean(overrideTarget)}
        dateStr={overrideTarget?.date}
        mealLabel={MEAL_KEYS.find((k) => k.key === overrideTarget?.meal)?.fullName || ''}
        mealOptions={MEAL_KEYS.map((k) => ({ key: k.key, label: k.fullName }))}
        activeMealKey={overrideTarget?.meal}
        onMealChange={(meal) => setOverrideTarget((t) => (t ? { ...t, meal } : t))}
        basePrice={overrideTarget ? mealPriceFor(overrideTarget.date, overrideTarget.meal, entries[overrideTarget.date], mealPrices).base : 0}
        currentOverride={overrideTarget ? entries[overrideTarget.date]?.overrides?.[overrideTarget.meal] ?? null : null}
        currentNote={overrideTarget ? mealNoteOf(entries[overrideTarget.date], overrideTarget.meal) : ''}
        saving={overrideSaving}
        onClose={() => setOverrideTarget(null)}
        onSave={saveDayOverride}
        onReset={resetDayOverride}
        onResetDay={overrideTarget && hasOverride(entries[overrideTarget.date]) ? () => resetWholeDay(overrideTarget.date) : undefined}
        dayHasOverride={overrideTarget ? hasOverride(entries[overrideTarget.date]) : false}
      />

      {/* Modal: Edit Payment Settings */}
      {editingPayment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-headline font-bold text-slate-900 flex items-center gap-2">
                <WalletIcon className="w-4 h-4 text-primary" />
                <span>Mess Payment Details</span>
              </h2>
              <button
                type="button"
                onClick={() => { setEditingPayment(false); setPaymentError('') }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors active:scale-95"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={savePaymentSettings} className="space-y-3.5">
              <p className="text-xs text-slate-500 leading-relaxed">
                Save the Mess UPI ID once — instant Pay and QR buttons will automatically use it for your bills.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 font-label">Payee Name</label>
                <input
                  type="text"
                  value={draftPayment.payeeName}
                  onChange={(e) => setDraftPayment({ ...draftPayment, payeeName: e.target.value })}
                  placeholder="e.g. Mess Aunty / Shardul"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 text-sm focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 font-label">UPI ID / VPA</label>
                <input
                  type="text"
                  value={draftPayment.upiId}
                  onChange={(e) => { setDraftPayment({ ...draftPayment, upiId: e.target.value }); if (paymentError) setPaymentError('') }}
                  placeholder="e.g. shardulsapre230@oksbi"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 text-sm tabular font-mono focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  required
                />
                {paymentError && <p className="text-xs text-due mt-1 font-medium">{paymentError}</p>}
              </div>

              {/* Quick Handle Suggestions */}
              <div>
                <span className="block text-[11px] font-semibold text-slate-500 mb-1.5 font-label">Popular UPI bank handles:</span>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_HANDLES.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => applyHandle(h)}
                      className="text-[11px] px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 font-mono transition-colors active:scale-95"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="flex-1 bg-primary hover:bg-blue-600 active:scale-98 text-white py-3 rounded-xl font-headline font-bold text-sm shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  {savingPayment ? 'Saving…' : 'Save Details'}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingPayment(false); setPaymentError('') }}
                  className="px-4 border border-slate-200 text-slate-700 py-3 rounded-xl font-headline font-semibold text-sm hover:bg-slate-50 transition-colors active:scale-98"
                >
                  Cancel
                </button>
              </div>
              {paymentConfig?.upiId && (
                <button
                  type="button"
                  onClick={removePayment}
                  disabled={savingPayment}
                  className="w-full mt-1 text-xs text-due hover:underline disabled:opacity-50 text-center"
                >
                  Remove UPI details
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Modal: QR Code & Pay Bottom Sheet */}
      {showQrModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity">
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Grab handle visual */}
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-900 font-headline uppercase tracking-wider">Pay Mess Bill</span>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors active:scale-95"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-label">Amount to Pay</p>
              <p className="text-3xl font-headline font-extrabold text-slate-900 tracking-tight tabular my-0.5">
                ₹{total.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500">
                Cycle: {formatDisplay(cycle.startDate)} - {formatDisplay(cycle.endDate)}
              </p>
            </div>

            {/* QR Code Container */}
            <div className="bg-slate-50 p-4 rounded-2xl inline-block border border-slate-200/80 my-3 shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=4&data=${encodeURIComponent(qrUrl)}`}
                alt="UPI QR Code"
                className="w-44 h-44 block mx-auto rounded-xl shadow-xs"
              />
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-left mb-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium font-label">Payee:</span>
                <span className="font-semibold text-slate-900">{paymentConfig?.payeeName}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium font-label">UPI ID:</span>
                <span className="font-mono text-slate-800 font-medium">{paymentConfig?.upiId}</span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(paymentConfig?.upiId)}
                className="w-full mt-2 py-2 text-xs border border-slate-200 bg-white rounded-lg text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 font-semibold transition-all active:scale-95 shadow-2xs"
              >
                {copied ? <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600" /> : <CopyIcon className="w-3.5 h-3.5" />}
                <span>{copied ? 'UPI ID Copied!' : 'Copy UPI ID'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={payNow}
              className="w-full bg-primary hover:bg-blue-600 active:scale-98 text-white font-headline font-bold py-3 px-4 rounded-xl shadow-md shadow-blue-500/20 text-sm inline-flex items-center justify-center gap-2 transition-all mb-2"
            >
              <ZapIcon className="w-4 h-4" />
              <span>Open in UPI App (GPay / PhonePe)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
