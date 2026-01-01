import jsPDF from 'jspdf'

interface InvoiceData {
    invoiceNumber: string
    invoiceType: 'membership' | 'trainer_addon' | 'membership_renewal' | 'trainer_renewal'
    amount: number // Total amount
    planPrice?: number // Base plan price (without fees)
    planName?: string
    planType?: string
    planMode?: string
    durationMonths?: number
    trainerName?: string
    trainerAddonPrice?: number // Trainer addon price (if applicable)
    userName: string
    userEmail: string
    userPhone?: string
    userAddress?: string
    paymentDate: string
    membershipStartDate?: string
    membershipEndDate?: string
    trainerPeriodEnd?: string
    admissionFee?: number
    monthlyFee?: number
}

export const generateInvoicePDF = (data: InvoiceData): jsPDF => {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 20
    const contentWidth = pageWidth - (margin * 2)
    let yPos = margin

    // Helper function to check page break
    const checkPageBreak = (space: number): boolean => {
        if (yPos + space > pageHeight - margin - 20) {
            doc.addPage()
            yPos = margin
            return true
        }
        return false
    }

    // Header Section
    doc.setFillColor(249, 115, 22)
    doc.rect(0, 0, pageWidth, 50, 'F')

    doc.setFillColor(220, 100, 20)
    doc.rect(0, 45, pageWidth, 5, 'F')

    yPos = 20
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('The 24 Fitness Gym', pageWidth / 2, yPos, { align: 'center' })

    yPos = 30
    doc.setFontSize(16)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(255, 255, 255)
    doc.text('INVOICE', pageWidth / 2, yPos, { align: 'center' })

    yPos = 60

    // Invoice Number and Date
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    doc.text(`Invoice #: ${data.invoiceNumber}`, margin, yPos)
    doc.text(`Date: ${new Date(data.paymentDate).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })}`, pageWidth - margin, yPos, { align: 'right' })

    yPos += 15

    // Bill To Section
    checkPageBreak(30)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(249, 115, 22)
    doc.text('Bill To:', margin, yPos)

    yPos += 7
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    doc.text(data.userName, margin, yPos)
    yPos += 5
    doc.text(data.userEmail, margin, yPos)
    if (data.userPhone) {
        yPos += 5
        doc.text(data.userPhone, margin, yPos)
    }
    if (data.userAddress) {
        yPos += 5
        const addressLines = doc.splitTextToSize(data.userAddress, 80)
        doc.text(addressLines, margin, yPos)
        yPos += addressLines.length * 5
    }

    yPos += 10

    // Invoice Type Badge
    checkPageBreak(20)
    const invoiceTypeLabels: Record<string, string> = {
        'membership': 'Membership Plan',
        'trainer_addon': 'Trainer Addon',
        'membership_renewal': 'Membership Renewal',
        'trainer_renewal': 'Trainer Access Renewal'
    }
    const invoiceTypeLabel = invoiceTypeLabels[data.invoiceType] || data.invoiceType

    doc.setFillColor(249, 115, 22)
    doc.roundedRect(margin, yPos, contentWidth, 8, 2, 2, 'F')
    yPos += 6
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(invoiceTypeLabel, margin + 5, yPos)
    yPos += 12

    // Items Table Header
    checkPageBreak(30)
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, yPos, contentWidth, 8, 'F')
    yPos += 6
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Description', margin + 2, yPos)
    doc.text('Amount', pageWidth - margin - 2, yPos, { align: 'right' })
    yPos += 8

    // Items
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')

    // Use planPrice if provided, otherwise calculate from total amount
    let basePlanAmount = data.planPrice
    if (basePlanAmount === undefined || basePlanAmount === null) {
        // Fallback: calculate base plan amount (amount minus fees and addons)
        basePlanAmount = data.amount
        if (data.admissionFee && data.admissionFee > 0) {
            basePlanAmount -= data.admissionFee
        }
        if (data.monthlyFee && data.monthlyFee > 0) {
            basePlanAmount -= data.monthlyFee
        }
        if (data.trainerAddonPrice && data.trainerAddonPrice > 0) {
            basePlanAmount -= data.trainerAddonPrice
        }
    }

    // Plan details - show plan name and details
    if (data.planName) {
        checkPageBreak(10)
        let description = `${data.planName.charAt(0).toUpperCase() + data.planName.slice(1)} Plan`
        if (data.planType) {
            description += ` (${data.planType})`
        }
        if (data.planMode) {
            description += ` - ${data.planMode === 'in_gym' ? 'In-Gym' : 'Online'}`
        }
        if (data.durationMonths) {
            description += ` - ${data.durationMonths} Month${data.durationMonths > 1 ? 's' : ''}`
        }
        doc.text(description, margin + 2, yPos)
        doc.text(`₹${basePlanAmount.toLocaleString('en-IN')}`, pageWidth - margin - 2, yPos, { align: 'right' })
        yPos += 7
    }

    // Admission fee (for in-gym plans)
    if (data.admissionFee && data.admissionFee > 0) {
        checkPageBreak(10)
        doc.text('Admission Fee (One-time)', margin + 2, yPos)
        doc.text(`₹${data.admissionFee.toLocaleString('en-IN')}`, pageWidth - margin - 2, yPos, { align: 'right' })
        yPos += 7
    }

    // Monthly fee (for in-gym plans)
    if (data.monthlyFee && data.monthlyFee > 0) {
        checkPageBreak(10)
        doc.text('Monthly Fee', margin + 2, yPos)
        doc.text(`₹${data.monthlyFee.toLocaleString('en-IN')}`, pageWidth - margin - 2, yPos, { align: 'right' })
        yPos += 7
    }

    // Trainer addon (with price)
    if (data.trainerName && data.trainerAddonPrice && data.trainerAddonPrice > 0) {
        checkPageBreak(10)
        doc.text(`Personal Trainer: ${data.trainerName}`, margin + 2, yPos)
        doc.text(`₹${data.trainerAddonPrice.toLocaleString('en-IN')}`, pageWidth - margin - 2, yPos, { align: 'right' })
        yPos += 7
    }

    // Dates (informational, no amount)
    if (data.membershipStartDate && data.membershipEndDate) {
        checkPageBreak(10)
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(
            `Membership Period: ${new Date(data.membershipStartDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} - ${new Date(data.membershipEndDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
            margin + 2,
            yPos
        )
        doc.setFontSize(10)
        doc.setTextColor(0, 0, 0)
        yPos += 7
    }

    if (data.trainerPeriodEnd) {
        checkPageBreak(10)
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(
            `Trainer Access Until: ${new Date(data.trainerPeriodEnd).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
            margin + 2,
            yPos
        )
        doc.setFontSize(10)
        doc.setTextColor(0, 0, 0)
        yPos += 7
    }

    yPos += 5

    // Total Section
    checkPageBreak(20)
    doc.setFillColor(249, 115, 22)
    doc.rect(margin, yPos, contentWidth, 10, 'F')
    yPos += 7
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('Total Amount:', margin + 2, yPos)
    doc.text(`₹${data.amount.toLocaleString('en-IN')}`, pageWidth - margin - 2, yPos, { align: 'right' })
    yPos += 15

    // Footer
    checkPageBreak(30)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(100, 100, 100)
    doc.text('Thank you for choosing The 24 Fitness Gym!', pageWidth / 2, yPos, { align: 'center' })
    yPos += 5
    doc.text('Please download and save this invoice. It may be deleted later.', pageWidth / 2, yPos, { align: 'center' })
    yPos += 5
    doc.text('For any queries, please contact us through the Contact page.', pageWidth / 2, yPos, { align: 'center' })

    return doc
}

// Generate unique invoice number
export const generateInvoiceNumber = (): string => {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `INV-${timestamp}-${random}`
}

