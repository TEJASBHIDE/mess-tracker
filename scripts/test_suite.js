import { priceOn, dayTotal, mealPriceFor, cycleTotal, hasOverride } from '../src/lib/calc.js'
import { todayStr, addDays, formatDisplay, datesInRange, isToday, isYesterday, formatRelativeDisplay } from '../src/lib/dateUtils.js'
import { sortCyclesAsc, findCoveringCycle, defaultCycleDoc } from '../src/lib/cycles.js'
import assert from 'node:assert'

console.log('🧪 Starting automated verification test suite for Mess Tracker...\n')

// Test 1: Date utilities
console.log('--- 1. Testing dateUtils.js ---')
const today = todayStr()
assert.match(today, /^\d{4}-\d{2}-\d{2}$/, 'todayStr format should be YYYY-MM-DD')
assert.strictEqual(isToday(today), true, 'isToday should return true for todayStr()')
assert.strictEqual(isToday(addDays(today, -1)), false, 'isToday should return false for yesterday')
assert.strictEqual(isYesterday(addDays(today, -1)), true, 'isYesterday should return true for addDays(-1)')
assert.strictEqual(addDays('2026-10-01', 1), '2026-10-02', 'addDays should increment date correctly')
assert.strictEqual(addDays('2026-10-31', 1), '2026-11-01', 'addDays should handle month roll-over')
const range = datesInRange('2026-10-01', '2026-10-03')
assert.deepStrictEqual(range, ['2026-10-01', '2026-10-02', '2026-10-03'], 'datesInRange should return inclusive date array')
console.log('✅ dateUtils tests passed successfully!')

// Test 2: Calculation logic
console.log('\n--- 2. Testing calc.js ---')
const mockPrices = [
  { id: 'p1', effectiveFrom: '2026-09-01', breakfast: 35, lunch: 45, dinner: 75 },
  { id: 'p2', effectiveFrom: '2026-10-01', breakfast: 40, lunch: 50, dinner: 85 }
]

// Price on dates
const septPrice = priceOn('2026-09-15', mockPrices)
assert.strictEqual(septPrice.breakfast, 35, 'Sept price for breakfast should be 35')
assert.strictEqual(septPrice.lunch, 45, 'Sept price for lunch should be 45')
assert.strictEqual(septPrice.dinner, 75, 'Sept price for dinner should be 75')

const octPrice = priceOn('2026-10-04', mockPrices)
assert.strictEqual(octPrice.breakfast, 40, 'Oct price for breakfast should be 40')
assert.strictEqual(octPrice.lunch, 50, 'Oct price for lunch should be 50')
assert.strictEqual(octPrice.dinner, 85, 'Oct price for dinner should be 85')

// Meal prices with overrides
const entryStandard = { breakfast: true, lunch: true, dinner: false, overrides: {} }
const bInfo = mealPriceFor('2026-10-04', 'breakfast', entryStandard, mockPrices)
assert.strictEqual(bInfo.price, 40)
assert.strictEqual(bInfo.isOverride, false)

const entryOverride = { breakfast: true, lunch: true, dinner: true, overrides: { dinner: 120, breakfast: 0 } }
const dInfo = mealPriceFor('2026-10-04', 'dinner', entryOverride, mockPrices)
assert.strictEqual(dInfo.price, 120, 'Override price should take precedence')
assert.strictEqual(dInfo.isOverride, true)

// Edge case: Free meal ($0.00 override)
const freeInfo = mealPriceFor('2026-10-04', 'breakfast', entryOverride, mockPrices)
assert.strictEqual(freeInfo.price, 0, 'Zero override should be 0, not fallback to 40')
assert.strictEqual(freeInfo.isOverride, true)

// Day total
const totalStd = dayTotal('2026-10-04', entryStandard, mockPrices)
assert.strictEqual(totalStd, 90, 'Breakfast (40) + Lunch (50) = 90')

const totalOv = dayTotal('2026-10-04', entryOverride, mockPrices)
assert.strictEqual(totalOv, 170, 'Breakfast (0) + Lunch (50) + Dinner (120) = 170')

// Cycle total
const mockEntries = {
  '2026-10-01': { breakfast: true, lunch: true, dinner: false, overrides: {} }, // 90
  '2026-10-02': { breakfast: false, lunch: false, dinner: true, overrides: {} }, // 85
  '2026-10-03': { breakfast: false, lunch: false, dinner: false, overrides: {} } // 0
}
const cycleDates = ['2026-10-01', '2026-10-02', '2026-10-03']
const totalCycleVal = cycleTotal(cycleDates, mockEntries, mockPrices)
assert.strictEqual(totalCycleVal, 175, 'Cycle total should equal 175 (90 + 85)')

console.log('✅ calc.js tests passed successfully!')

// Test 3: Billing cycles logic
console.log('\n--- 3. Testing cycles.js ---')
const mockCycles = [
  { id: 'c2', startDate: '2026-10-01', endDate: '2026-10-31' },
  { id: 'c1', startDate: '2026-09-01', endDate: '2026-09-30' },
  { id: 'c3', startDate: '2026-11-01', endDate: '2026-11-30' }
]
const sorted = sortCyclesAsc(mockCycles)
assert.strictEqual(sorted[0].id, 'c1', 'First cycle should be c1 (Sept)')
assert.strictEqual(sorted[1].id, 'c2', 'Second cycle should be c2 (Oct)')
assert.strictEqual(sorted[2].id, 'c3', 'Third cycle should be c3 (Nov)')

const covered = findCoveringCycle(mockCycles, '2026-10-15')
assert.strictEqual(covered.id, 'c2', 'Should find covering cycle for 2026-10-15')

const defaultDoc = defaultCycleDoc('2026-10-15')
assert.match(defaultDoc.startDate, /^\d{4}-\d{2}-\d{2}$/)
assert.match(defaultDoc.endDate, /^\d{4}-\d{2}-\d{2}$/)
assert.ok(defaultDoc.createdAt, 'defaultDoc should have createdAt timestamp')
console.log('✅ cycles.js tests passed successfully!')

// Test 4: PDF generation logic
console.log('\n--- 4. Testing pdfGenerator.js ---')
const { generateMealSummaryPdf } = await import('../src/lib/pdfGenerator.js')
const pdfDoc = generateMealSummaryPdf({
  user: { displayName: 'Test Student', email: 'student@example.com' },
  cycle: { startDate: '2026-10-01', endDate: '2026-10-31' },
  dates: ['2026-10-01', '2026-10-02', '2026-10-03'],
  entries: {
    '2026-10-01': { breakfast: true, lunch: true, dinner: true },
    '2026-10-02': { breakfast: false, lunch: true, dinner: true },
    '2026-10-03': { breakfast: false, lunch: false, dinner: false }
  },
  mealPrices: [{ id: 'p1', effectiveFrom: '2026-10-01', breakfast: 40, lunch: 50, dinner: 80 }],
  paymentConfig: { payeeName: 'Annapurna Mess', upiId: 'annapurna@okaxis', phoneNumber: '9876543210' }
})
assert.ok(pdfDoc, 'pdfDoc should be created')
assert.ok(pdfDoc.getNumberOfPages() >= 1, 'PDF should have at least 1 page')
console.log('✅ pdfGenerator tests passed successfully!')

console.log('\n🎉 ALL TESTS PASSED! Zero functional regressions detected.')
