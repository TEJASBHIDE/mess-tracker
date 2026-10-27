import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDisplay } from './dateUtils.js'
import { dayTotal, mealPriceFor } from './calc.js'

/**
 * Draws the vector Indian Rupee symbol (₹) using canvas paths in jsPDF.
 * Fits within a width/height box at (x, y).
 */
function drawRupeeSymbol(doc, x, y, size = 16, color = [255, 255, 255]) {
  doc.saveGraphicsState()
  doc.setDrawColor(...color)
  doc.setFillColor(...color)
  doc.setLineWidth(size * 0.12)

  // Top horizontal bar
  doc.line(x, y + size * 0.1, x + size * 0.7, y + size * 0.1)

  // Second horizontal bar
  doc.line(x, y + size * 0.35, x + size * 0.65, y + size * 0.35)

  // Vertical stem and upper loop
  doc.line(x + size * 0.2, y + size * 0.1, x + size * 0.2, y + size * 0.6)

  // Loop curve
  doc.line(x + size * 0.2, y + size * 0.6, x + size * 0.5, y + size * 0.6)
  doc.line(x + size * 0.5, y + size * 0.1, x + size * 0.5, y + size * 0.6)

  // Diagonal leg down-right
  doc.line(x + size * 0.2, y + size * 0.6, x + size * 0.65, y + size * 0.95)

  doc.restoreGraphicsState()
}

/**
 * Builds the complete Mess Owner-Friendly Bill Summary PDF.
 */
export function generateMealSummaryPdf({
  user,
  cycle,
  dates = [],
  entries = {},
  mealPrices = [],
  paymentConfig = null
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14

  // 1. Gather all calculations
  let totalBreakfastCount = 0
  let totalLunchCount = 0
  let totalDinnerCount = 0

  let totalBreakfastCost = 0
  let totalLunchCost = 0
  let totalDinnerCost = 0

  const overridesList = []

  const tableRows = dates.map((dStr) => {
    const entry = entries[dStr] || { breakfast: false, lunch: false, dinner: false }
    const dateObj = new Date(dStr + 'T00:00:00')
    const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'short' })
    const formattedDate = dateObj.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short'
    })

    const bInfo = mealPriceFor(dStr, 'breakfast', entry, mealPrices)
    const lInfo = mealPriceFor(dStr, 'lunch', entry, mealPrices)
    const dInfo = mealPriceFor(dStr, 'dinner', entry, mealPrices)

    let bCell = '—'
    if (entry.breakfast) {
      totalBreakfastCount++
      totalBreakfastCost += bInfo.price
      bCell = `Rs. ${bInfo.price}${bInfo.isOverride ? '*' : ''}`
      if (bInfo.isOverride) {
        overridesList.push({ date: dStr, meal: 'Breakfast', price: bInfo.price, note: entry.mealNotes?.breakfast })
      }
    }

    let lCell = '—'
    if (entry.lunch) {
      totalLunchCount++
      totalLunchCost += lInfo.price
      lCell = `Rs. ${lInfo.price}${lInfo.isOverride ? '*' : ''}`
      if (lInfo.isOverride) {
        overridesList.push({ date: dStr, meal: 'Lunch', price: lInfo.price, note: entry.mealNotes?.lunch })
      }
    }

    let dCell = '—'
    if (entry.dinner) {
      totalDinnerCount++
      totalDinnerCost += dInfo.price
      dCell = `Rs. ${dInfo.price}${dInfo.isOverride ? '*' : ''}`
      if (dInfo.isOverride) {
        overridesList.push({ date: dStr, meal: 'Dinner', price: dInfo.price, note: entry.mealNotes?.dinner })
      }
    }

    const dTotal = dayTotal(dStr, entry, mealPrices)
    const totalCell = dTotal > 0 ? `Rs. ${dTotal}` : '—'

    return {
      rawDate: dStr,
      dateCol: `${formattedDate} (${dayName})`,
      bCell,
      lCell,
      dCell,
      totalCell,
      hasMeals: dTotal > 0
    }
  })

  const totalMealsCount = totalBreakfastCount + totalLunchCount + totalDinnerCount
  const grandTotalAmount = totalBreakfastCost + totalLunchCost + totalDinnerCost

  // 2. Document Header
  let currentY = 16

  // Brand title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(15, 23, 42) // Slate-900
  doc.text('MESS ATTENDANCE & BILL SUMMARY', margin, currentY)

  // Subtitle
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139) // Slate-500
  currentY += 5
  doc.text('Official monthly meal attendance register for billing verification', margin, currentY)

  // Divider line
  currentY += 4
  doc.setDrawColor(226, 232, 240) // Slate-200
  doc.setLineWidth(0.5)
  doc.line(margin, currentY, pageWidth - margin, currentY)

  // 3. Info Metadata Grid (Student / Cycle Info)
  currentY += 6
  doc.setFontSize(9)

  const studentName = user?.displayName || 'Student Account'
  const studentEmail = user?.email || 'N/A'
  const cycleDisplay = `${formatDisplay(cycle.startDate)} to ${formatDisplay(cycle.endDate)}`
  const generatedTime = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  // Left side: Student info
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(71, 85, 105)
  doc.text('STUDENT / USER:', margin, currentY)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(studentName, margin + 34, currentY)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(`(${studentEmail})`, margin + 34 + doc.getTextWidth(studentName) + 2, currentY)

  // Right side: Generated Time
  const genText = `Generated: ${generatedTime}`
  doc.text(genText, pageWidth - margin - doc.getTextWidth(genText), currentY)

  currentY += 5
  // Left side: Billing cycle
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(71, 85, 105)
  doc.text('BILLING PERIOD:', margin, currentY)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 102, 255) // Primary blue
  doc.text(`${cycleDisplay} (${dates.length} Days)`, margin + 34, currentY)

  // 4. BIG TOTAL HERO CARD (Designed for fast recognition by Mess Owner)
  currentY += 8
  const cardHeight = 26
  const cardWidth = pageWidth - margin * 2

  // Background Fill (Deep Sleek Slate/Blue)
  doc.setFillColor(15, 23, 42) // Slate-900
  doc.roundedRect(margin, currentY, cardWidth, cardHeight, 3, 3, 'F')

  // Top accent stripe
  doc.setFillColor(0, 102, 255)
  doc.roundedRect(margin, currentY, cardWidth, 2, 1, 1, 'F')

  // Left column: Label & Total
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184) // Slate-400
  doc.text('TOTAL AMOUNT PAYABLE', margin + 7, currentY + 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(255, 255, 255) // White
  const totalAmountStr = `Rs. ${grandTotalAmount.toLocaleString('en-IN')}`
  doc.text(totalAmountStr, margin + 7, currentY + 19)

  // Right column: Quick stats badge
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text('TOTAL MEALS CONSUMED', margin + cardWidth - 65, currentY + 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(34, 197, 94) // Emerald Green
  doc.text(`${totalMealsCount} Meals`, margin + cardWidth - 65, currentY + 19)

  // 5. Summary Breakdown Table (Breakfast, Lunch, Dinner)
  currentY += cardHeight + 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text('MEAL SUMMARY AT A GLANCE', margin, currentY)

  currentY += 2
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'plain',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      fontStyle: 'bold',
      fontSize: 8.5
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [30, 41, 59]
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45 },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' }
    },
    head: [['Meal Type', 'Meals Taken', 'Standard Rate', 'Meal Subtotal']],
    body: [
      [
        'Breakfast',
        `${totalBreakfastCount} days`,
        mealPrices.length ? `Rs. ${mealPrices[0].breakfast || 0}` : '—',
        `Rs. ${totalBreakfastCost.toLocaleString('en-IN')}`
      ],
      [
        'Lunch',
        `${totalLunchCount} days`,
        mealPrices.length ? `Rs. ${mealPrices[0].lunch || 0}` : '—',
        `Rs. ${totalLunchCost.toLocaleString('en-IN')}`
      ],
      [
        'Dinner',
        `${totalDinnerCount} days`,
        mealPrices.length ? `Rs. ${mealPrices[0].dinner || 0}` : '—',
        `Rs. ${totalDinnerCost.toLocaleString('en-IN')}`
      ]
    ],
    foot: [
      [
        'Grand Total',
        `${totalMealsCount} meals taken`,
        `${dates.length} cycle days`,
        `Rs. ${grandTotalAmount.toLocaleString('en-IN')}`
      ]
    ],
    footStyles: {
      fillColor: [235, 242, 255],
      textColor: [0, 102, 255],
      fontStyle: 'bold',
      fontSize: 9
    }
  })

  currentY = doc.lastAutoTable.finalY + 8

  // 6. Day-by-Day Attendance Table (Register matching the mess owner's physical book)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text('DAILY ATTENDANCE REGISTER (Day-by-Day Verification)', margin, currentY)

  currentY += 2
  const tableData = tableRows.map((r) => [
    r.dateCol,
    r.bCell,
    r.lCell,
    r.dCell,
    r.totalCell
  ])

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin, bottom: 20 },
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2
    },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [71, 85, 105],
      fontStyle: 'bold',
      fontSize: 8
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42 },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'right', fontStyle: 'bold' }
    },
    head: [['Date & Day', 'Breakfast', 'Lunch', 'Dinner', 'Day Total']],
    body: tableData,
    didParseCell: (data) => {
      // Color meals present green, absent gray
      if (data.section === 'body') {
        const text = String(data.cell.raw)
        if (text === '—') {
          data.cell.styles.textColor = [148, 163, 184] // Slate-400
        } else if (text.startsWith('Rs.')) {
          if (data.column.index === 4) {
            data.cell.styles.textColor = [15, 23, 42] // Slate-900 for day total
          } else {
            data.cell.styles.textColor = [22, 163, 74] // Green-600 for present meals
          }
        }
      }
    }
  })

  currentY = doc.lastAutoTable.finalY + 6

  // Check if we need a new page for footer / payment info
  if (currentY > pageHeight - 35) {
    doc.addPage()
    currentY = 16
  }

  // 7. Special Notes / Custom Overrides (if any)
  if (overridesList.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(15, 23, 42)
    doc.text('* Special Price Overrides & Notes:', margin, currentY)

    currentY += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(71, 85, 105)

    overridesList.forEach((item) => {
      const noteStr = item.note ? ` (${item.note})` : ''
      doc.text(
        `• ${formatDisplay(item.date)} ${item.meal}: Rs. ${item.price}${noteStr}`,
        margin + 4,
        currentY
      )
      currentY += 3.5
    })
    currentY += 2
  }

  // 8. Payment & UPI Settlement Information
  if (paymentConfig?.upiId || paymentConfig?.payeeName) {
    const payBoxY = currentY
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(margin, payBoxY, cardWidth, 16, 2, 2, 'F')
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(margin, payBoxY, cardWidth, 16, 2, 2, 'D')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(71, 85, 105)
    doc.text('PAYMENT BENEFICIARY DETAILS (UPI):', margin + 5, payBoxY + 5)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(15, 23, 42)
    const payee = paymentConfig.payeeName || 'Mess Owner'
    const upi = paymentConfig.upiId || ''
    const phone = paymentConfig.phoneNumber ? ` | Phone: ${paymentConfig.phoneNumber}` : ''
    doc.text(`Payee: ${payee}  |  UPI ID: ${upi}${phone}`, margin + 5, payBoxY + 11)
  }

  // 9. Add Page Numbers to all pages
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(148, 163, 184)
    doc.text(
      `Mess Tracker • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    )
  }

  return doc
}

/**
 * Downloads the PDF directly to device.
 */
export function downloadMealSummaryPdf(params) {
  const doc = generateMealSummaryPdf(params)
  const filename = `Mess_Bill_${params.cycle.startDate}_to_${params.cycle.endDate}.pdf`
  doc.save(filename)
  return filename
}

/**
 * Shares the PDF directly on WhatsApp or triggers mobile native share sheet.
 */
export async function shareMealSummaryPdf(params) {
  const doc = generateMealSummaryPdf(params)
  const filename = `Mess_Bill_${params.cycle.startDate}_to_${params.cycle.endDate}.pdf`

  // Compute stats for friendly message
  let totalMeals = 0
  params.dates.forEach((d) => {
    const e = params.entries[d]
    if (e?.breakfast) totalMeals++
    if (e?.lunch) totalMeals++
    if (e?.dinner) totalMeals++
  })

  let totalAmount = 0
  params.dates.forEach((d) => {
    totalAmount += dayTotal(d, params.entries[d], params.mealPrices)
  })

  const cycleText = `${formatDisplay(params.cycle.startDate)} to ${formatDisplay(params.cycle.endDate)}`
  const payee = params.paymentConfig?.payeeName ? `Hi ${params.paymentConfig.payeeName}, ` : 'Hi, '
  const shareText = `${payee}here is my Mess Bill attendance summary for ${cycleText}.\n\n• Total Meals: ${totalMeals}\n• Total Amount Payable: Rs. ${totalAmount.toLocaleString('en-IN')}\n\nGenerated via Mess Tracker.`

  // Check if Web Share API with files is supported (Android & iOS mobile)
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.share) {
    try {
      const pdfBlob = doc.output('blob')
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' })

      if (navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          title: `Mess Bill - ${cycleText}`,
          text: shareText,
          files: [pdfFile]
        })
        return { success: true, method: 'web-share' }
      }
    } catch (shareErr) {
      if (shareErr.name === 'AbortError') {
        // User cancelled share dialog
        return { success: false, cancelled: true }
      }
      console.warn('Native file share failed, falling back to download + WhatsApp link:', shareErr)
    }
  }

  // Fallback (Desktop or browser without file sharing):
  // 1. Download the PDF file to computer/phone
  doc.save(filename)

  // 2. Open WhatsApp with pre-filled summary text
  const encodedText = encodeURIComponent(shareText)
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText}`
  window.open(whatsappUrl, '_blank')

  return { success: true, method: 'download-and-whatsapp' }
}
