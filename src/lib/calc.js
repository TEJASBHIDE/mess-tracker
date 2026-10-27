// mealPrices: array of { id, effectiveFrom, breakfast, lunch, dinner }, any order.
// Returns the price row effective on `dateStr` (latest effectiveFrom <= dateStr).
// If no price entry exists on or before `dateStr`, it falls back to the earliest
// configured price so that days before the first recorded price change are not 
// priced at 0. Returns null if mealPrices is empty.
export function priceOn(dateStr, mealPrices) {
  if (!mealPrices || mealPrices.length === 0) return null

  // 1. Try to find the latest price effective on or before dateStr
  const applicable = mealPrices
    .filter((p) => p.effectiveFrom <= dateStr)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))

  if (applicable.length > 0) {
    return applicable[0]
  }

  // 2. Fallback: If dateStr is earlier than all effective dates, use the earliest configured price
  const sortedAsc = [...mealPrices].sort((a, b) => (a.effectiveFrom > b.effectiveFrom ? 1 : -1))
  return sortedAsc[0] || null
}

// entry: { breakfast: bool, lunch: bool, dinner: bool, overrides?: { breakfast?: number|null, lunch?: number|null, dinner?: number|null } }
// Per-day override wins when it is a finite number >= 0; otherwise falls back to global priceOn().
export function mealPriceFor(dateStr, mealKey, entry, mealPrices) {
  const baseRow = priceOn(dateStr, mealPrices)
  const base = baseRow ? Number(baseRow[mealKey]) || 0 : 0
  const raw = entry?.overrides?.[mealKey]
  // Explicit null/undefined/'' = use global. Guard NaN/negative.
  if (raw === null || raw === undefined || raw === '') {
    return { price: base, base, isOverride: false }
  }
  const custom = Number(raw)
  if (!Number.isFinite(custom) || custom < 0) {
    return { price: base, base, isOverride: false }
  }
  const isOverride = custom !== base
  return { price: isOverride ? custom : base, base, isOverride }
}

export function hasOverride(entry) {
  if (!entry?.overrides) return false
  return ['breakfast', 'lunch', 'dinner'].some((k) => {
    const v = entry.overrides[k]
    return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
  })
}

// entry: { breakfast: bool, lunch: bool, dinner: bool }
export function dayTotal(dateStr, entry, mealPrices) {
  if (!entry) return 0
  let total = 0
  if (entry.breakfast) total += mealPriceFor(dateStr, 'breakfast', entry, mealPrices).price
  if (entry.lunch) total += mealPriceFor(dateStr, 'lunch', entry, mealPrices).price
  if (entry.dinner) total += mealPriceFor(dateStr, 'dinner', entry, mealPrices).price
  return total
}

// entriesByDate: { [dateStr]: entry }
// dates: array of dateStr to sum over (the active billing cycle)
export function cycleTotal(dates, entriesByDate, mealPrices) {
  return dates.reduce((sum, d) => sum + dayTotal(d, entriesByDate[d], mealPrices), 0)
}
