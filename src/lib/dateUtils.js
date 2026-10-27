// All dates are handled as 'YYYY-MM-DD' strings (local time, no timezone math needed
// since the mess and the user are in the same place).

export function toDateStr(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function todayStr() {
  return toDateStr(new Date())
}

// Default billing cycle = the calendar month containing `refDateStr`.
export function defaultCycleFor(refDateStr) {
  const [y, m] = refDateStr.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0) // last day of month
  return { startDate: toDateStr(start), endDate: toDateStr(end) }
}

// All date strings between start and end, inclusive.
export function datesInRange(startStr, endStr) {
  const out = []
  const start = new Date(startStr + 'T00:00:00')
  const end = new Date(endStr + 'T00:00:00')
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(toDateStr(d))
  }
  return out
}

export function formatDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function isToday(dateStr) {
  return dateStr === todayStr()
}

export function isYesterday(dateStr) {
  return dateStr === addDays(todayStr(), -1)
}

export function formatRelativeDisplay(dateStr) {
  if (isToday(dateStr)) return 'Today'
  if (isYesterday(dateStr)) return 'Yesterday'
  const tomorrow = addDays(todayStr(), 1)
  if (dateStr === tomorrow) return 'Tomorrow'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { weekday: 'short' })
}
