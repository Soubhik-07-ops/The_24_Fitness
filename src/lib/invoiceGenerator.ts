/**
 * Professional Invoice PDF Generator
 * Generates clean, well-formatted invoices for approved payments
 */

import jsPDF from 'jspdf';

export interface InvoiceData {
    // Gym details
    gymName: string;
    gymAddress: string;
    contactEmail: string;
    contactPhone: string;

    // User details
    userName: string;
    userEmail: string;
    userPhone?: string;
    userAddress?: string;

    // Membership details
    planName: string;
    planType: string; // 'Online' or 'In-Gym'
    durationMonths: number;
    startDate: string;
    endDate: string;

    // Trainer details (if applicable)
    trainerName?: string;
    trainerPeriodEnd?: string;

    // Payment details
    invoiceNumber: string;
    paymentDate: string;
    transactionId: string;
    approvedAt: string;
    approvedBy: string; // Admin email (will be formatted as friendly label)

    // Invoice type
    invoiceType: 'initial' | 'renewal' | 'trainer_renewal';

    // Payment breakdown
    basePlanAmount: number;
    addonAmount: number; // Sum of all addons
    totalAmount: number;

    // Addons breakdown (optional, for detailed invoices)
    addons?: Array<{
        type: string;
        name: string;
        price: number;
    }>;
}

/**
 * Generate invoice number: INV-YYYYMMDD-XXXXX (5 digits)
 */
export function generateInvoiceNumber(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    return `INV-${year}${month}${day}-${random}`;
}

/**
 * Format currency in Indian Rupees with consistent formatting
 * Ensures no spacing artifacts and proper Indian number format
 */
function formatCurrency(amount: number): string {
    // Ensure amount is a valid number
    const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;

    // Use toLocaleString with Indian locale and replace any non-standard spaces
    const formatted = numAmount.toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
        useGrouping: true
    });

    // Replace any potential non-breaking spaces or special characters with regular characters
    // and ensure currency symbol is directly attached
    const cleanFormatted = formatted.replace(/\u00A0/g, '').replace(/\s/g, '');

    return `₹${cleanFormatted}`;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return dateString; // Return original if invalid
        }
        return date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch {
        return dateString;
    }
}

/**
 * Format date with time
 */
function formatDateTime(dateString: string): string {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return dateString; // Return original if invalid
        }
        return date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateString;
    }
}

/**
 * Capitalize plan name properly
 * Examples: "basic" → "Basic", "regular monthly" → "Regular Monthly", "premium" → "Premium"
 */
function capitalizePlanName(planName: string): string {
    if (!planName || typeof planName !== 'string') {
        return planName || '';
    }

    // Handle special cases
    const lower = planName.toLowerCase().trim();
    const specialCases: Record<string, string> = {
        'basic': 'Basic',
        'premium': 'Premium',
        'elite': 'Elite',
        'regular monthly': 'Regular Monthly',
        'regular': 'Regular'
    };

    if (specialCases[lower]) {
        return specialCases[lower];
    }

    // General capitalization: capitalize first letter of each word
    return planName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Format plan type for display
 */
function formatPlanType(planType: string): string {
    const lower = (planType || '').toLowerCase();
    if (lower.includes('gym') || lower === 'in_gym' || lower === 'ingym') {
        return 'In-Gym';
    }
    return 'Online';
}

/**
 * Get invoice type label
 */
function getInvoiceTypeLabel(type: string): string {
    switch (type) {
        case 'initial':
            return 'Initial Purchase';
        case 'renewal':
            return 'Membership Renewal';
        case 'trainer_renewal':
            return 'Trainer Access Renewal';
        default:
            return 'Payment';
    }
}

/**
 * Format admin email to friendly label
 * Always shows "The 24 Fitness Gym (Admin)" instead of email
 */
function formatApprovedBy(adminEmail: string): string {
    return 'The 24 Fitness Gym (Admin)';
}

/**
 * Generate professional invoice PDF
 */
export function generateInvoicePDF(data: InvoiceData): jsPDF {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    let yPos = margin;
    let currentPage = 1;

    // Track if we actually added any content after checking for overflow
    const hasContentOnPage = () => {
        return doc.getNumberOfPages() > 0;
    };

    // Helper function to check if we need a new page
    const checkPageBreak = (requiredSpace: number): boolean => {
        if (yPos + requiredSpace > pageHeight - margin - 20) {
            doc.addPage();
            currentPage++;
            yPos = margin + 10;
            return true;
        }
        return false;
    };

    // Helper function to add text with proper formatting
    const addText = (
        text: string,
        x: number,
        y: number,
        options: {
            fontSize?: number;
            fontStyle?: 'normal' | 'bold' | 'italic';
            color?: [number, number, number];
            align?: 'left' | 'center' | 'right';
            maxWidth?: number;
        } = {}
    ): number => {
        const {
            fontSize = 10,
            fontStyle = 'normal',
            color = [0, 0, 0],
            align = 'left',
            maxWidth = contentWidth
        } = options;

        doc.setFontSize(fontSize);
        doc.setFont('helvetica', fontStyle);
        doc.setTextColor(color[0], color[1], color[2]);

        const sanitizedText = String(text || '');
        const lines = doc.splitTextToSize(sanitizedText, maxWidth);
        let currentY = y;

        for (let i = 0; i < lines.length; i++) {
            checkPageBreak(fontSize * 0.5);
            doc.text(lines[i], x, currentY, { align });
            currentY += fontSize * 0.4;
        }

        return lines.length * (fontSize * 0.4) + 2;
    };

    // Header Section
    doc.setFillColor(249, 115, 22);
    doc.rect(0, 0, pageWidth, 45, 'F');

    yPos = 20;
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(data.gymName.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });

    yPos = 30;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(255, 255, 255);
    doc.text('INVOICE', pageWidth / 2, yPos, { align: 'center' });

    // Invoice number (top right, on header background)
    yPos = 38;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`Invoice #: ${data.invoiceNumber}`, pageWidth - margin, yPos, { align: 'right' });

    yPos = 55;

    // Gym Address (left side)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    yPos += addText('From:', margin, yPos, { fontSize: 10, fontStyle: 'bold' });
    yPos += 2;
    yPos += addText(data.gymName, margin, yPos, { fontSize: 10, fontStyle: 'bold' });
    yPos += 1;
    yPos += addText(data.gymAddress, margin, yPos, { fontSize: 9 });
    yPos += 1;
    yPos += addText(`Phone: ${data.contactPhone}`, margin, yPos, { fontSize: 9 });
    yPos += 1;
    yPos += addText(`Email: ${data.contactEmail}`, margin, yPos, { fontSize: 9 });

    // Bill To (right side)
    const billToY = 55;
    let billToCurrentY = billToY;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    billToCurrentY += addText('Bill To:', pageWidth - margin, billToCurrentY, { fontSize: 10, fontStyle: 'bold', align: 'right', maxWidth: 80 });
    billToCurrentY += 2;
    billToCurrentY += addText(data.userName, pageWidth - margin, billToCurrentY, { fontSize: 10, fontStyle: 'bold', align: 'right', maxWidth: 80 });
    billToCurrentY += 1;
    billToCurrentY += addText(data.userEmail, pageWidth - margin, billToCurrentY, { fontSize: 9, align: 'right', maxWidth: 80 });
    if (data.userPhone) {
        billToCurrentY += 1;
        billToCurrentY += addText(`Phone: ${data.userPhone}`, pageWidth - margin, billToCurrentY, { fontSize: 9, align: 'right', maxWidth: 80 });
    }
    if (data.userAddress) {
        billToCurrentY += 1;
        billToCurrentY += addText(data.userAddress, pageWidth - margin, billToCurrentY, { fontSize: 9, align: 'right', maxWidth: 80 });
    }

    yPos = Math.max(yPos, billToCurrentY) + 10;

    // Invoice Details Box - Two-column grid layout with fixed widths and proper spacing
    // This ensures no text overlap regardless of invoice type length
    const boxPadding = 8;
    const boxTopPadding = 8;
    const boxBottomPadding = 8;
    const columnGap = 8; // Gap between left and right columns
    const leftColumnWidth = (contentWidth - boxPadding * 2 - columnGap) / 2; // Two columns with gap
    const rightColumnWidth = leftColumnWidth;
    const labelWidth = 38; // Fixed width for labels (enough for "Transaction ID:")
    const valueWidth = leftColumnWidth - labelWidth - 5; // Remaining width for values (with 5mm gap after label)
    const lineSpacing = 5.5;
    const minLineHeight = 4.5; // Minimum height per line to prevent overlap

    // Prepare all text values
    const invoiceTypeLabel = getInvoiceTypeLabel(data.invoiceType);
    const approvedByText = formatApprovedBy(data.approvedBy);
    const approvedAtText = formatDateTime(data.approvedAt);
    const paymentDateText = formatDate(data.paymentDate);
    const transactionId = data.transactionId || 'N/A';
    
    // Calculate text wrapping for all fields (must set font first)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const invoiceTypeLines = doc.splitTextToSize(invoiceTypeLabel, valueWidth);
    const transactionIdLines = doc.splitTextToSize(transactionId, valueWidth);
    const approvedAtLines = doc.splitTextToSize(approvedAtText, valueWidth);
    const approvedByLines = doc.splitTextToSize(approvedByText, valueWidth);
    const paymentDateLines = doc.splitTextToSize(paymentDateText, valueWidth);
    
    // Calculate total height needed for each column
    // Left column: Invoice Type, Payment Date, Transaction ID
    const leftColumnHeight = Math.max(
        invoiceTypeLines.length * minLineHeight,
        paymentDateLines.length * minLineHeight,
        transactionIdLines.length * minLineHeight
    ) + (2 * lineSpacing); // 2 gaps between 3 fields
    
    // Right column: Approved At, Approved By
    const rightColumnHeight = Math.max(
        approvedAtLines.length * minLineHeight,
        approvedByLines.length * minLineHeight
    ) + lineSpacing; // 1 gap between 2 fields
    
    // Use the taller column plus padding
    const maxColumnHeight = Math.max(leftColumnHeight, rightColumnHeight);
    const detailsBoxHeight = boxTopPadding + maxColumnHeight + boxBottomPadding;

    checkPageBreak(detailsBoxHeight + 5);

    // Draw background box
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, yPos, contentWidth, detailsBoxHeight, 2, 2, 'FD');

    const detailsY = yPos + boxTopPadding;
    let leftColumnY = detailsY;
    let rightColumnY = detailsY;

    // Helper function to render a label-value pair in left column
    const renderLeftField = (label: string, value: string, currentY: number): number => {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        const labelX = margin + boxPadding;
        doc.text(label, labelX, currentY);
        
        doc.setFont('helvetica', 'normal');
        const valueX = margin + boxPadding + labelWidth + 5; // 5mm gap after label
        const valueLines = doc.splitTextToSize(value, valueWidth);
        
        let lineY = currentY;
        valueLines.forEach((line: string, index: number) => {
            if (index > 0) lineY += minLineHeight;
            doc.text(line, valueX, lineY);
        });
        
        // Return the height used (max of label or value lines)
        return Math.max(lineSpacing, valueLines.length * minLineHeight);
    };

    // Helper function to render a label-value pair in right column
    const renderRightField = (label: string, value: string, currentY: number): number => {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        const rightColumnStartX = margin + boxPadding + leftColumnWidth + columnGap;
        const labelX = rightColumnStartX;
        doc.text(label, labelX, currentY);
        
        doc.setFont('helvetica', 'normal');
        const valueX = rightColumnStartX + labelWidth + 5; // 5mm gap after label
        const valueLines = doc.splitTextToSize(value, valueWidth);
        
        let lineY = currentY;
        valueLines.forEach((line: string, index: number) => {
            if (index > 0) lineY += minLineHeight;
            doc.text(line, valueX, lineY);
        });
        
        // Return the height used (max of label or value lines)
        return Math.max(lineSpacing, valueLines.length * minLineHeight);
    };

    // Left column fields
    leftColumnY += renderLeftField('Invoice Type:', invoiceTypeLabel, leftColumnY);
    leftColumnY += lineSpacing;
    leftColumnY += renderLeftField('Payment Date:', paymentDateText, leftColumnY);
    leftColumnY += lineSpacing;
    leftColumnY += renderLeftField('Transaction ID:', transactionId, leftColumnY);

    // Right column fields
    rightColumnY += renderRightField('Approved At:', approvedAtText, rightColumnY);
    rightColumnY += lineSpacing;
    rightColumnY += renderRightField('Approved By:', approvedByText, rightColumnY);

    yPos += detailsBoxHeight + 8;

    // Membership Details Section
    checkPageBreak(40);
    yPos += 5;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(249, 115, 22);
    yPos += addText('Membership Details', margin, yPos, { fontSize: 12, fontStyle: 'bold', color: [249, 115, 22] });

    yPos += 3;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    // Plan information table - Fixed column widths
    const tableStartY = yPos;
    const rowHeight = 7;
    let tableCurrentY = tableStartY;
    const descColX = margin + 3;
    const detailsColX = margin + contentWidth / 2;

    // Table header
    checkPageBreak(rowHeight + 5);
    doc.setFillColor(249, 115, 22);
    doc.rect(margin, tableCurrentY, contentWidth, rowHeight, 'F');
    tableCurrentY += rowHeight / 2 + 2;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Description', descColX, tableCurrentY);
    doc.text('Details', detailsColX, tableCurrentY);
    tableCurrentY += rowHeight / 2 + 2;

    // Plan details rows
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(220, 220, 220);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const capitalizedPlanName = capitalizePlanName(data.planName);
    const formattedPlanType = formatPlanType(data.planType);

    const planRows = [
        { label: 'Plan Name', value: capitalizedPlanName },
        { label: 'Plan Type', value: formattedPlanType },
        { label: 'Duration', value: `${data.durationMonths} Month${data.durationMonths > 1 ? 's' : ''}` },
        { label: 'Start Date', value: formatDate(data.startDate) },
        { label: 'End Date', value: formatDate(data.endDate) }
    ];

    if (data.trainerName) {
        planRows.push({ label: 'Assigned Trainer', value: data.trainerName });
        if (data.trainerPeriodEnd) {
            planRows.push({ label: 'Trainer Access Until', value: formatDate(data.trainerPeriodEnd) });
        }
    }

    planRows.forEach((row, index) => {
        checkPageBreak(rowHeight + 2);

        if (index % 2 === 0) {
            doc.setFillColor(255, 255, 255);
        } else {
            doc.setFillColor(250, 250, 250);
        }
        doc.rect(margin, tableCurrentY - rowHeight / 2, contentWidth, rowHeight, 'FD');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(row.label + ':', descColX, tableCurrentY);

        doc.setFont('helvetica', 'normal');
        const valueLines = doc.splitTextToSize(row.value, contentWidth / 2 - 10);
        doc.text(valueLines[0], detailsColX, tableCurrentY);
        if (valueLines.length > 1) {
            // Handle multi-line values
            tableCurrentY += 3.5;
            doc.text(valueLines[1], detailsColX, tableCurrentY);
        }

        tableCurrentY += rowHeight + 2;
    });

    yPos = tableCurrentY + 5;

    // Payment Breakdown Section
    checkPageBreak(60);
    yPos += 5;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(249, 115, 22);
    yPos += addText('Payment Breakdown', margin, yPos, { fontSize: 12, fontStyle: 'bold', color: [249, 115, 22] });

    yPos += 3;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    // Payment breakdown table - Fixed column widths with safe margins
    const breakdownTableY = yPos;
    let breakdownY = breakdownTableY;
    const itemColX = margin + 5;
    const amountRightPadding = 8; // Safe padding from right edge
    const amountColX = pageWidth - margin - amountRightPadding; // Right edge with padding
    const amountTextX = amountColX; // Text alignment position (right-aligned text uses this X position)
    const maxItemWidth = amountTextX - itemColX - 15; // Maximum width for item text to prevent overflow
    const breakdownRowHeight = 7;

    // Table header
    checkPageBreak(breakdownRowHeight + 5);
    doc.setFillColor(249, 115, 22);
    doc.rect(margin, breakdownY, contentWidth, 8, 'F');
    breakdownY += 4;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Item', itemColX, breakdownY);
    // Right-align "Amount" header
    doc.text('Amount', amountTextX, breakdownY, { align: 'right' });
    breakdownY += 8;

    // Base plan
    checkPageBreak(breakdownRowHeight + 2);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(220, 220, 220);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.rect(margin, breakdownY, contentWidth, breakdownRowHeight, 'FD');
    breakdownY += 3.5;
    doc.setFontSize(9);
    const planText = `${capitalizedPlanName} (${data.durationMonths} Month${data.durationMonths > 1 ? 's' : ''})`;
    // Ensure item text doesn't overflow into amount column (maxItemWidth already defined above)
    const planTextLines = doc.splitTextToSize(planText, maxItemWidth);
    doc.text(planTextLines[0], itemColX, breakdownY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const formattedAmount = formatCurrency(data.basePlanAmount);
    doc.text(formattedAmount, amountTextX, breakdownY, { align: 'right' });
    breakdownY += breakdownRowHeight;

    // Addons (if any)
    if (data.addonAmount > 0) {
        if (data.addons && data.addons.length > 0) {
            // Show individual addons
            data.addons.forEach((addon, index) => {
                checkPageBreak(breakdownRowHeight + 2);

                if (index % 2 === 0) {
                    doc.setFillColor(255, 255, 255);
                } else {
                    doc.setFillColor(250, 250, 250);
                }
                doc.rect(margin, breakdownY, contentWidth, breakdownRowHeight, 'FD');
                breakdownY += 3.5;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                const addonNameLines = doc.splitTextToSize(addon.name, maxItemWidth);
                doc.text(addonNameLines[0], itemColX, breakdownY);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                const addonFormattedAmount = formatCurrency(addon.price);
                doc.text(addonFormattedAmount, amountTextX, breakdownY, { align: 'right' });
                breakdownY += breakdownRowHeight;
            });
        } else {
            // Show total addon amount
            checkPageBreak(breakdownRowHeight + 2);
            doc.setFillColor(250, 250, 250);
            doc.rect(margin, breakdownY, contentWidth, breakdownRowHeight, 'FD');
            breakdownY += 3.5;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('Addons', itemColX, breakdownY);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            const addonTotalFormatted = formatCurrency(data.addonAmount);
            doc.text(addonTotalFormatted, amountTextX, breakdownY, { align: 'right' });
            breakdownY += breakdownRowHeight;
        }
    }

    // Total row
    breakdownY += 2;
    checkPageBreak(10);
    doc.setFillColor(249, 115, 22);
    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(1);
    doc.rect(margin, breakdownY, contentWidth, 10, 'FD');
    breakdownY += 5;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Total Amount', itemColX, breakdownY);
    const totalFormattedAmount = formatCurrency(data.totalAmount);
    doc.text(totalFormattedAmount, amountTextX, breakdownY, { align: 'right' });
    breakdownY += 10;

    yPos = breakdownY + 10;

    // Footer - Only add if there's space
    const footerHeight = 25;
    if (yPos + footerHeight <= pageHeight - margin) {
        yPos += 5;
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(120, 120, 120);
        doc.text('Thank you for your business!', pageWidth / 2, yPos, { align: 'center' });
        yPos += 5;
        doc.setFontSize(8);
        doc.text('This is a computer-generated invoice. No signature required.', pageWidth / 2, yPos, { align: 'center' });
    }

    // Add page numbers to all pages (only if we have multiple pages or content)
    const totalPages = doc.getNumberOfPages();
    if (totalPages > 0) {
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(150, 150, 150);
            doc.text(
                `Page ${i} of ${totalPages}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
    }

    return doc;
}