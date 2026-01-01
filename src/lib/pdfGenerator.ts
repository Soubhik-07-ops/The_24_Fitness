import jsPDF from 'jspdf'

interface FormData {
    [key: string]: any
}

export const generateMembershipFormPDF = (formData: FormData, planName: string, planType: string): jsPDF => {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15 // Reduced margin for more content space
    const contentWidth = pageWidth - 2 * margin
    let yPos = margin

    // Helper function to add new page if needed
    const checkPageBreak = (requiredSpace: number): boolean => {
        if (yPos + requiredSpace > pageHeight - margin - 15) {
            doc.addPage()
            yPos = margin
            return true
        }
        return false
    }

    // Helper function to add text with proper wrapping and page breaks
    const addText = (text: string, x: number, y: number, options: {
        maxWidth?: number,
        fontSize?: number,
        fontStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic',
        color?: [number, number, number],
        align?: 'left' | 'center' | 'right'
    } = {}): number => {
        const {
            maxWidth = contentWidth,
            fontSize = 10,
            fontStyle = 'normal',
            color = [0, 0, 0],
            align = 'left'
        } = options

        // Sanitize text - handle null, undefined, and convert to string
        const sanitizedText = text != null ? String(text) : ''
        if (!sanitizedText) return 0

        doc.setFontSize(fontSize)
        doc.setFont('helvetica', fontStyle)
        doc.setTextColor(color[0], color[1], color[2])

        const lines = doc.splitTextToSize(sanitizedText, maxWidth)

        // Handle page breaks for multi-line text
        let currentY = y
        for (let i = 0; i < lines.length; i++) {
            if (currentY + (fontSize * 0.4) > pageHeight - margin - 20) {
                doc.addPage()
                currentY = margin + 10
            }
            doc.text(lines[i], x, currentY, { align })
            currentY += fontSize * 0.4
        }

        return lines.length * (fontSize * 0.4) + 2
    }

    // Header Section with improved styling
    doc.setFillColor(249, 115, 22)
    doc.rect(0, 0, pageWidth, 40, 'F')

    // Add a subtle gradient effect with darker bottom
    doc.setFillColor(220, 100, 20)
    doc.rect(0, 35, pageWidth, 5, 'F')

    yPos = 22
    doc.setFontSize(30)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('24 FITNESS GYM', pageWidth / 2, yPos, { align: 'center' })

    yPos = 32
    doc.setFontSize(17)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(255, 255, 255)
    doc.text('Membership Application Form', pageWidth / 2, yPos, { align: 'center' })

    yPos = 50

    // Define safeFormat function before using it
    const safeFormat = (value: any): string => {
        if (value === null || value === undefined) return 'Not provided'
        if (typeof value === 'boolean') return value ? 'Yes' : 'No'
        if (Array.isArray(value)) {
            if (value.length === 0) return 'None'
            return value.map(v => String(v)).join(', ')
        }
        if (typeof value === 'object') return JSON.stringify(value)
        return String(value).trim() || 'Not provided'
    }

    // Plan Information Box with improved styling
    doc.setFillColor(250, 250, 250)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.5)
    doc.roundedRect(margin, yPos, contentWidth, 15, 3, 3, 'FD')

    yPos += 10
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(249, 115, 22)
    doc.text(`Plan: ${planName.charAt(0).toUpperCase() + planName.slice(1)}`, margin + 8, yPos)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(70, 70, 70)
    doc.text(`Type: ${planType === 'online' ? 'Online Training' : 'In-Gym Training'}`, pageWidth - margin - 8, yPos, { align: 'right' })

    yPos += 15

    // Section 1: Personal Information
    yPos = addSection(doc, '1. Personal Information', {
        'Name': safeFormat(formData.name),
        'Date': safeFormat(formData.date),
        'Date of Birth': safeFormat(formData.dateOfBirth),
        'Email': safeFormat(formData.email),
        'Phone Number': safeFormat(formData.phone),
        'Age': formData.age ? `${safeFormat(formData.age)} years` : 'Not provided',
        'Gender': formatGender(formData.gender),
        'Address': safeFormat(formData.address),
        'City': safeFormat(formData.city),
        'State': safeFormat(formData.state),
        'Pincode': safeFormat(formData.pincode),
        'Emergency Contact Name': safeFormat(formData.emergencyContact),
        'Emergency Contact Phone': safeFormat(formData.emergencyPhone)
    }, margin, yPos, pageWidth, contentWidth, checkPageBreak, addText)

    // Section 2: Medical Information
    yPos = addSection(doc, '2. Medical Information', {
        'Present State of Health': formatHealthState(safeFormat(formData.presentHealthState), safeFormat(formData.presentHealthStateOther)),
        'Current Medications': safeFormat(formData.currentMedications) || 'None',
        'Medication Adherence': formatYesNo(safeFormat(formData.medicationAdherence)),
        'Medication Adherence Reason': safeFormat(formData.medicationAdherenceReason) || 'N/A',
        'Supplements': formatYesNo(safeFormat(formData.supplements)),
        'Supplements List': safeFormat(formData.supplementsList) || 'N/A',
        'Last Physician Visit': safeFormat(formData.lastPhysicianVisit) || 'Not provided',
        'Cholesterol Checked': formatYesNo(safeFormat(formData.cholesterolChecked)),
        'Cholesterol Test Date': safeFormat(formData.cholesterolDate) || 'N/A',
        'Total Cholesterol': safeFormat(formData.totalCholesterol) || 'N/A',
        'HDL (High-density lipoprotein)': safeFormat(formData.hdl) || 'N/A',
        'LDL (Low-density lipoprotein)': safeFormat(formData.ldl) || 'N/A',
        'Triglycerides': safeFormat(formData.triglycerides) || 'N/A',
        'Blood Sugar Checked': formatYesNo(safeFormat(formData.bloodSugarChecked)),
        'Blood Sugar Results': safeFormat(formData.bloodSugarResults) || 'N/A',
        'Medical Conditions': formatMedicalConditions(formData.medicalConditions),
        'Major Surgeries': safeFormat(formData.majorSurgeries) || 'None',
        'Past Injuries': safeFormat(formData.pastInjuries) || 'None',
        'Other Health Conditions': safeFormat(formData.otherHealthConditions) || 'None'
    }, margin, yPos, pageWidth, contentWidth, checkPageBreak, addText)

    // Section 3: Family History
    yPos = addSection(doc, '3. Family History', formatFamilyHistory(formData.familyHistory), margin, yPos, pageWidth, contentWidth, checkPageBreak, addText)

    // Section 4: Nutrition
    yPos = addSection(doc, '4. Nutrition', {
        'Dietary Goals': safeFormat(formData.dietaryGoals) || 'Not provided',
        'Modified Diet': formatYesNo(safeFormat(formData.modifiedDiet)),
        'Modified Diet Description': safeFormat(formData.modifiedDietDescription) || 'N/A',
        'Specialized Eating Plan': formatYesNo(safeFormat(formData.specializedEatingPlan)),
        'Eating Plan Type': safeFormat(formData.eatingPlanType) || 'N/A',
        'Eating Plan Reason': safeFormat(formData.eatingPlanReason) || 'N/A',
        'Eating Plan Prescribed by Physician': formatYesNo(safeFormat(formData.eatingPlanPrescribed)),
        'Eating Plan Duration': safeFormat(formData.eatingPlanDuration) || 'N/A',
        'Dietitian Consultation': formatYesNo(safeFormat(formData.dietitianConsultation)),
        'Dietitian Interest': safeFormat(formData.dietitianInterest) || 'N/A',
        'Nutritional Issues': safeFormat(formData.nutritionalIssues) || 'None',
        'Water Intake': formData.waterIntake ? `${safeFormat(formData.waterIntake)} glasses (8-ounce) per day` : 'Not provided',
        'Other Beverages': safeFormat(formData.otherBeverages) || 'None',
        'Food Allergies or Intolerance': safeFormat(formData.foodAllergies) === 'yes' ? `Yes - ${safeFormat(formData.foodAllergiesList) || 'Details not provided'}` : 'No',
        'Food Preparation': Array.isArray(formData.foodPreparation) && formData.foodPreparation.length > 0
            ? formData.foodPreparation.map((p: string) => String(p).charAt(0).toUpperCase() + String(p).slice(1)).join(', ')
            : 'Not specified',
        'Dine Out Frequency': formData.dineOutFrequency ? `${safeFormat(formData.dineOutFrequency)} times per week` : 'Not provided',
        'Restaurant Type - Breakfast': safeFormat(formData.restaurantBreakfast) || 'N/A',
        'Restaurant Type - Lunch': safeFormat(formData.restaurantLunch) || 'N/A',
        'Restaurant Type - Dinner': safeFormat(formData.restaurantDinner) || 'N/A',
        'Restaurant Type - Snacks': safeFormat(formData.restaurantSnacks) || 'N/A',
        'Food Cravings': safeFormat(formData.foodCravings) === 'yes' ? `Yes - ${safeFormat(formData.foodCravingsList) || 'Details not provided'}` : 'No'
    }, margin, yPos, pageWidth, contentWidth, checkPageBreak, addText)

    // Section 5: Substance-related Habits
    yPos = addSection(doc, '5. Substance-related Habits', {
        'Alcohol Consumption': safeFormat(formData.alcohol) === 'yes'
            ? `Yes - Frequency: ${safeFormat(formData.alcoholFrequency) || 'N/A'} times/week, Amount: ${safeFormat(formData.alcoholAmount) || 'N/A'}`
            : 'No',
        'Caffeinated Beverages': safeFormat(formData.caffeinatedBeverages) === 'yes'
            ? `Yes - ${safeFormat(formData.caffeineAmount) || 'N/A'} per day`
            : 'No',
        'Tobacco Use': safeFormat(formData.tobacco) === 'yes'
            ? `Yes - ${safeFormat(formData.tobaccoAmount) || 'Details not provided'}`
            : 'No'
    }, margin, yPos, pageWidth, contentWidth, checkPageBreak, addText)

    // Section 6: Physical Activity
    yPos = addSection(doc, '6. Physical Activity', {
        'Structured Physical Activity': formatYesNo(safeFormat(formData.structuredActivity)),
        'Cardiorespiratory Activity': formData.cardioMinutes ? `${safeFormat(formData.cardioMinutes)} minutes, ${safeFormat(formData.cardioTimesPerWeek) || 0} times/week` : 'N/A',
        'Muscular Training Sessions': formData.muscularTrainingSessions ? `${safeFormat(formData.muscularTrainingSessions)} sessions per week` : 'N/A',
        'Flexibility Training Sessions': formData.flexibilitySessions ? `${safeFormat(formData.flexibilitySessions)} sessions per week` : 'N/A',
        'Sports/Recreational Activities': formData.sportsMinutes ? `${safeFormat(formData.sportsMinutes)} minutes per week - ${safeFormat(formData.sportsActivities) || 'Activities not specified'}` : 'N/A',
        'Other Physical Activity': safeFormat(formData.otherPhysicalActivity) === 'yes' ? safeFormat(formData.otherPhysicalActivityDescription) : 'No',
        'Activity-Related Injuries': safeFormat(formData.activityInjuries) === 'yes' ? safeFormat(formData.activityInjuriesDescription) : 'No',
        'Physical Activity Restrictions': Array.isArray(formData.activityRestrictions) && formData.activityRestrictions.length > 0
            ? formData.activityRestrictions.map(r => safeFormat(r)).join(', ')
            : (safeFormat(formData.activityRestrictions) || 'None'),
        'Feelings About Exercise': safeFormat(formData.exerciseFeelings) || 'Not provided',
        'Favorite Physical Activities': safeFormat(formData.favoriteActivities) || 'Not provided'
    }, margin, yPos, pageWidth, contentWidth, checkPageBreak, addText)

    // Section 7: Occupational
    yPos = addSection(doc, '7. Occupational', {
        'Currently Working': formatYesNo(safeFormat(formData.work)),
        'Occupation': safeFormat(formData.occupation) || 'N/A',
        'Work Schedule': safeFormat(formData.workSchedule) || 'N/A',
        'Activity Level During Work Day': safeFormat(formData.workActivityLevel) || 'Not provided'
    }, margin, yPos, pageWidth, contentWidth, checkPageBreak, addText)

    // Section 8: Sleep and Stress
    yPos = addSection(doc, '8. Sleep and Stress', {
        'Hours of Sleep per Night': formData.sleepHours ? `${safeFormat(formData.sleepHours)} hours` : 'Not provided',
        'Average Stress Level': formData.stressLevel ? `${safeFormat(formData.stressLevel)}/10 (1 = no stress, 10 = constant stress)` : 'Not provided',
        'Main Stress Causes': safeFormat(formData.stressCauses) || 'Not provided',
        'Appetite Affected by Stress': formatStressAppetite(safeFormat(formData.stressAppetite))
    }, margin, yPos, pageWidth, contentWidth, checkPageBreak, addText)

    // Section 9: Weight History
    yPos = addSection(doc, '9. Weight History', {
        'Present Weight': formData.presentWeightUnknown ? 'Unknown' : (formData.presentWeight ? `${safeFormat(formData.presentWeight)} kg` : 'Not provided'),
        'Weight Goal': formatWeightGoal(safeFormat(formData.weightGoal)),
        'Lowest Weight (Past 5 Years)': formData.lowestWeight5Years ? `${safeFormat(formData.lowestWeight5Years)} kg` : 'Not provided',
        'Highest Weight (Past 5 Years)': formData.highestWeight5Years ? `${safeFormat(formData.highestWeight5Years)} kg` : 'Not provided',
        'Ideal Weight': formData.idealWeightUnknown ? 'Unknown' : (formData.idealWeight ? `${safeFormat(formData.idealWeight)} kg` : 'Not provided'),
        'Waist Circumference': formData.measurementsUnknown ? 'Unknown' : (formData.waistCircumference ? `${safeFormat(formData.waistCircumference)} cm` : 'Not provided'),
        'Hip Circumference': formData.measurementsUnknown ? 'Unknown' : (formData.hipCircumference ? `${safeFormat(formData.hipCircumference)} cm` : 'Not provided'),
        'Body Composition (Body Fat %)': formData.bodyCompositionUnknown ? 'Unknown' : (formData.bodyComposition ? `${safeFormat(formData.bodyComposition)}%` : 'Not provided')
    }, margin, yPos, pageWidth, contentWidth, checkPageBreak, addText)

    // Section 10: Goals
    yPos = addSection(doc, '10. Goals', {
        'Lifestyle Adoption Likelihood': formData.lifestyleAdoptionLikelihood ? `${safeFormat(formData.lifestyleAdoptionLikelihood)}/10 (1 = very unlikely, 10 = very likely)` : 'Not provided',
        'Specific Health Goals': formatYesNo(safeFormat(formData.specificHealthGoals)),
        'Health Goals (in order of importance)': safeFormat(formData.healthGoalsList) || 'N/A',
        'Weight Loss Goal': safeFormat(formData.weightLossGoal) === 'yes' ? `Yes - ${safeFormat(formData.weightLossGoalAmount) || 'Details not provided'}` : 'No',
        'Importance of Weight Loss': safeFormat(formData.weightLossImportance) || 'Not provided'
    }, margin, yPos, pageWidth, contentWidth, checkPageBreak, addText)

    // Footer on all pages with improved styling
    const totalPages = doc.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)

        // Footer line with better styling
        doc.setDrawColor(220, 220, 220)
        doc.setLineWidth(0.5)
        doc.line(margin, pageHeight - 18, pageWidth - margin, pageHeight - 18)

        // Footer text with better formatting
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 100, 100)
        doc.text(
            `Page ${i} of ${totalPages}`,
            pageWidth / 2,
            pageHeight - 12,
            { align: 'center' }
        )
        doc.setFontSize(8)
        doc.setTextColor(120, 120, 120)
        doc.text(
            'The 24 Fitness Gym - Confidential Membership Application Form',
            pageWidth / 2,
            pageHeight - 6,
            { align: 'center' }
        )
    }

    return doc
}

function addSection(
    doc: jsPDF,
    title: string,
    data: { [key: string]: string },
    margin: number,
    startY: number,
    pageWidth: number,
    contentWidth: number,
    checkPageBreak: (space: number) => boolean,
    addText: (text: string, x: number, y: number, options?: any) => number
): number {
    const pageHeight = doc.internal.pageSize.getHeight()
    let yPos = startY

    // Check if we need a new page for section header
    if (yPos + 25 > pageHeight - margin - 20) {
        doc.addPage()
        yPos = margin
    }

    // Section Title with improved styling
    doc.setFillColor(249, 115, 22)
    doc.roundedRect(margin, yPos, contentWidth, 10, 2, 2, 'F')

    yPos += 7
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    const titleLines = doc.splitTextToSize(title, contentWidth - 6)
    doc.text(titleLines, margin + 5, yPos)
    yPos += titleLines.length * 5 + 5

    // Filter out truly empty entries but keep N/A and other placeholders
    const validEntries = Object.entries(data).filter(([key, value]) => {
        if (value === null || value === undefined || value === '') return false
        // Keep valid values including "N/A", "None", "Not provided", etc.
        return true
    })

    // If no valid entries, show a message
    if (validEntries.length === 0) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(120, 120, 120)
        doc.text('No information provided for this section.', margin + 5, yPos)
        yPos += 8
        return yPos
    }

    // Improved layout with better spacing and styling
    for (const [key, value] of validEntries) {
        // Check page break before adding question (need at least 15mm)
        if (yPos + 15 > pageHeight - margin - 20) {
            doc.addPage()
            yPos = margin
        }

        // Question (Bold, with better formatting)
        const questionText = `${key}:`
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(30, 30, 30)

        const questionLines = doc.splitTextToSize(questionText, contentWidth - 8)
        let questionY = yPos
        for (let i = 0; i < questionLines.length; i++) {
            if (questionY + 5 > pageHeight - margin - 20) {
                doc.addPage()
                questionY = margin
                yPos = margin
            }
            doc.text(questionLines[i], margin + 4, questionY)
            questionY += 5
        }
        yPos = questionY + 2

        // Answer (Normal, indented with better formatting)
        const answerText = value || 'Not provided'
        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(50, 50, 50)

        const answerLines = doc.splitTextToSize(answerText, contentWidth - 12)
        let answerY = yPos
        for (let i = 0; i < answerLines.length; i++) {
            if (answerY + 5 > pageHeight - margin - 20) {
                doc.addPage()
                answerY = margin
                yPos = margin
            }
            doc.text(answerLines[i], margin + 8, answerY)
            answerY += 4.5
        }
        yPos = answerY + 4 // Better spacing between questions
    }

    // Add spacing after section
    yPos += 5
    return yPos
}

function formatGender(gender: string): string {
    if (!gender) return 'Not provided'
    const genderMap: { [key: string]: string } = {
        'male': 'Male',
        'female': 'Female',
        'other': 'Other',
        'prefer_not_to_say': 'Prefer not to say'
    }
    return genderMap[gender] || gender.charAt(0).toUpperCase() + gender.slice(1)
}

function formatYesNo(value: string): string {
    if (!value) return 'Not provided'
    if (value === 'yes') return 'Yes'
    if (value === 'no') return 'No'
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatHealthState(state: string, other: string): string {
    if (!state) return 'Not provided'
    if (state === 'other') return `Other: ${other || 'Details not provided'}`
    const stateMap: { [key: string]: string } = {
        'very_well': 'Very Well',
        'healthy': 'Healthy',
        'unhealthy': 'Unhealthy',
        'unwell': 'Unwell'
    }
    return stateMap[state] || state.charAt(0).toUpperCase() + state.slice(1).replace('_', ' ')
}

function formatMedicalConditions(conditions: any): string {
    if (!conditions) return 'None'
    const selected = Object.entries(conditions)
        .filter(([_, data]: [string, any]) => data?.checked)
        .map(([key, data]: [string, any]) => {
            const conditionName = key.replace(/_/g, ' ')
                .replace(/\b\w/g, (l: string) => l.toUpperCase())
            return data?.details ? `${conditionName} (${data.details})` : conditionName
        })
    return selected.length > 0 ? selected.join('; ') : 'None'
}

function formatFamilyHistory(history: any): { [key: string]: string } {
    if (!history) return {}
    const result: { [key: string]: string } = {}
    const labels: { [key: string]: string } = {
        heartDisease: 'Heart Disease',
        highCholesterol: 'High Cholesterol',
        highBloodPressure: 'High Blood Pressure',
        cancer: 'Cancer',
        diabetes: 'Diabetes',
        osteoporosis: 'Osteoporosis'
    }

    for (const [key, data] of Object.entries(history)) {
        if ((data as any)?.checked) {
            const relation = (data as any)?.relation || 'Not specified'
            const age = (data as any)?.age || 'Not specified'
            result[labels[key] || key] = `Yes - Relation: ${relation}, Age at diagnosis: ${age}`
        } else {
            result[labels[key] || key] = 'No'
        }
    }
    return result
}

function formatStressAppetite(appetite: string): string {
    if (!appetite) return 'Not provided'
    const appetiteMap: { [key: string]: string } = {
        'increased': 'Increased',
        'decreased': 'Decreased',
        'not_affected': 'Not Affected'
    }
    return appetiteMap[appetite] || appetite.charAt(0).toUpperCase() + appetite.slice(1).replace('_', ' ')
}

function formatWeightGoal(goal: string): string {
    if (!goal) return 'Not provided'
    const goalMap: { [key: string]: string } = {
        'lose_weight': 'Lose Weight',
        'gain_weight': 'Gain Weight',
        'maintain_weight': 'Maintain Weight'
    }
    return goalMap[goal] || goal.charAt(0).toUpperCase() + goal.slice(1).replace('_', ' ')
}
