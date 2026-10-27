import { defaultCycleFor, todayStr } from './dateUtils.js'

// A billing cycle: { id?, startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', createdAt?, label? }

export function cycleLabel(c) {
  if (!c) return ''
  if (c.label) return c.label
  return `${c.startDate} → ${c.endDate}`
}

export function coversToday(cycle, refDate = todayStr()) {
  if (!cycle) return false
  return cycle.startDate <= refDate && refDate <= cycle.endDate
}

export function isExpired(cycle, refDate = todayStr()) {
  if (!cycle) return true
  return cycle.endDate < refDate
}

export function findCoveringCycle(cycles, refDate = todayStr()) {
  return (cycles || []).find((c) => c.startDate <= refDate && refDate <= c.endDate) || null
}

export function sortCyclesAsc(cycles) {
  return [...(cycles || [])].sort((a, b) => {
    if (a.startDate === b.startDate) return (a.endDate < b.endDate ? -1 : 1)
    return a.startDate < b.startDate ? -1 : 1
  })
}

export function defaultCycleDoc(refDate = todayStr()) {
  const base = defaultCycleFor(refDate)
  return {
    ...base,
    createdAt: new Date().toISOString()
  }
}
