'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Navbar from '@/components/Navbar/Navbar'
import Footer from '@/components/Footer/Footer'
import { renderFormSection } from '@/components/MembershipForm/FormSections'
import { generateMembershipFormPDF } from '@/lib/pdfGenerator'
import Toast from '@/components/Toast/Toast'
import { useToast } from '@/hooks/useToast'
import styles from './form.module.css'

// Comprehensive form data interface based on the provided forms
interface ComprehensiveFormData {
    // Personal Information
    name: string
    date: string
    dateOfBirth: string
    email: string
    phone: string
    age: string
    gender: string
    address: string
    city: string
    state: string
    pincode: string
    emergencyContact: string
    emergencyPhone: string

    // Medical Information
    presentHealthState: string
    presentHealthStateOther: string
    currentMedications: string
    medicationAdherence: string
    medicationAdherenceReason: string
    supplements: string
    supplementsList: string
    lastPhysicianVisit: string
    cholesterolChecked: string
    cholesterolDate: string
    cholesterolResults: string
    totalCholesterol: string
    hdl: string
    ldl: string
    triglycerides: string
    bloodSugarChecked: string
    bloodSugarResults: string
    medicalConditions: { [key: string]: { checked: boolean; details: string } }
    majorSurgeries: string
    pastInjuries: string
    otherHealthConditions: string

    // Family History
    familyHistory: {
        heartDisease: { checked: boolean; relation: string; age: string }
        highCholesterol: { checked: boolean; relation: string; age: string }
        highBloodPressure: { checked: boolean; relation: string; age: string }
        cancer: { checked: boolean; relation: string; age: string }
        diabetes: { checked: boolean; relation: string; age: string }
        osteoporosis: { checked: boolean; relation: string; age: string }
    }

    // Nutrition
    dietaryGoals: string
    modifiedDiet: string
    modifiedDietDescription: string
    specializedEatingPlan: string
    eatingPlanType: string
    eatingPlanReason: string
    eatingPlanPrescribed: string
    eatingPlanDuration: string
    dietitianConsultation: string
    dietitianInterest: string
    nutritionalIssues: string
    waterIntake: string
    otherBeverages: string
    foodAllergies: string
    foodAllergiesList: string
    foodPreparation: string[]
    dineOutFrequency: string
    restaurantBreakfast: string
    restaurantLunch: string
    restaurantDinner: string
    restaurantSnacks: string
    foodCravings: string
    foodCravingsList: string

    // Substance-related Habits
    alcohol: string
    alcoholFrequency: string
    alcoholAmount: string
    caffeinatedBeverages: string
    caffeineAmount: string
    tobacco: string
    tobaccoAmount: string

    // Physical Activity
    structuredActivity: string
    cardioMinutes: string
    cardioTimesPerWeek: string
    muscularTrainingSessions: string
    flexibilitySessions: string
    sportsMinutes: string
    sportsActivities: string
    otherPhysicalActivity: string
    otherPhysicalActivityDescription: string
    activityInjuries: string
    activityInjuriesDescription: string
    activityRestrictions: string[]
    exerciseFeelings: string
    favoriteActivities: string

    // Occupational
    work: string
    occupation: string
    workSchedule: string
    workActivityLevel: string

    // Sleep and Stress
    sleepHours: string
    stressLevel: string
    stressCauses: string
    stressAppetite: string

    // Weight History
    presentWeight: string
    presentWeightUnknown: boolean
    weightGoal: string
    lowestWeight5Years: string
    highestWeight5Years: string
    idealWeight: string
    idealWeightUnknown: boolean
    waistCircumference: string
    hipCircumference: string
    measurementsUnknown: boolean
    bodyComposition: string
    bodyCompositionUnknown: boolean

    // Goals
    lifestyleAdoptionLikelihood: string
    specificHealthGoals: string
    healthGoalsList: string
    weightLossGoal: string
    weightLossGoalAmount: string
    weightLossImportance: string
}

export default function MembershipFormPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [loading, setLoading] = useState(false)
    const [user, setUser] = useState<any>(null)
    const [currentSection, setCurrentSection] = useState(0)
    const { toast, toastType, showToast, hideToast } = useToast()

    const planId = searchParams.get('planId')
    const planType = searchParams.get('planType')
    const planName = searchParams.get('planName')
    const price = searchParams.get('price')
    const duration = searchParams.get('duration')
    const membershipId = searchParams.get('membershipId')
    const renew = searchParams.get('renew') // 'trainer' or 'plan'
    const [existingMembership, setExistingMembership] = useState<any>(null)

    // Initialize comprehensive form data
    const [formData, setFormData] = useState<ComprehensiveFormData>({
        name: '',
        date: new Date().toISOString().split('T')[0],
        dateOfBirth: '',
        email: '',
        phone: '',
        age: '',
        gender: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        emergencyContact: '',
        emergencyPhone: '',
        presentHealthState: '',
        presentHealthStateOther: '',
        currentMedications: '',
        medicationAdherence: '',
        medicationAdherenceReason: '',
        supplements: '',
        supplementsList: '',
        lastPhysicianVisit: '',
        cholesterolChecked: '',
        cholesterolDate: '',
        cholesterolResults: '',
        totalCholesterol: '',
        hdl: '',
        ldl: '',
        triglycerides: '',
        bloodSugarChecked: '',
        bloodSugarResults: '',
        medicalConditions: {},
        majorSurgeries: '',
        pastInjuries: '',
        otherHealthConditions: '',
        familyHistory: {
            heartDisease: { checked: false, relation: '', age: '' },
            highCholesterol: { checked: false, relation: '', age: '' },
            highBloodPressure: { checked: false, relation: '', age: '' },
            cancer: { checked: false, relation: '', age: '' },
            diabetes: { checked: false, relation: '', age: '' },
            osteoporosis: { checked: false, relation: '', age: '' }
        },
        dietaryGoals: '',
        modifiedDiet: '',
        modifiedDietDescription: '',
        specializedEatingPlan: '',
        eatingPlanType: '',
        eatingPlanReason: '',
        eatingPlanPrescribed: '',
        eatingPlanDuration: '',
        dietitianConsultation: '',
        dietitianInterest: '',
        nutritionalIssues: '',
        waterIntake: '',
        otherBeverages: '',
        foodAllergies: '',
        foodAllergiesList: '',
        foodPreparation: [],
        dineOutFrequency: '',
        restaurantBreakfast: '',
        restaurantLunch: '',
        restaurantDinner: '',
        restaurantSnacks: '',
        foodCravings: '',
        foodCravingsList: '',
        alcohol: '',
        alcoholFrequency: '',
        alcoholAmount: '',
        caffeinatedBeverages: '',
        caffeineAmount: '',
        tobacco: '',
        tobaccoAmount: '',
        structuredActivity: '',
        cardioMinutes: '',
        cardioTimesPerWeek: '',
        muscularTrainingSessions: '',
        flexibilitySessions: '',
        sportsMinutes: '',
        sportsActivities: '',
        otherPhysicalActivity: '',
        otherPhysicalActivityDescription: '',
        activityInjuries: '',
        activityInjuriesDescription: '',
        activityRestrictions: [],
        exerciseFeelings: '',
        favoriteActivities: '',
        work: '',
        occupation: '',
        workSchedule: '',
        workActivityLevel: '',
        sleepHours: '',
        stressLevel: '',
        stressCauses: '',
        stressAppetite: '',
        presentWeight: '',
        presentWeightUnknown: false,
        weightGoal: '',
        lowestWeight5Years: '',
        highestWeight5Years: '',
        idealWeight: '',
        idealWeightUnknown: false,
        waistCircumference: '',
        hipCircumference: '',
        measurementsUnknown: false,
        bodyComposition: '',
        bodyCompositionUnknown: false,
        lifestyleAdoptionLikelihood: '',
        specificHealthGoals: '',
        healthGoalsList: '',
        weightLossGoal: '',
        weightLossGoalAmount: '',
        weightLossImportance: ''
    })

    const sections = [
        'Personal Information',
        'Medical Information',
        'Family History',
        'Nutrition',
        'Substance-related Habits',
        'Physical Activity',
        'Occupational',
        'Sleep and Stress',
        'Weight History',
        'Goals'
    ]

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                router.push('/signup?redirect=/membership/form')
                return
            }
            setUser(session.user)

            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', session.user.id)
                .single()

            if (profile) {
                setFormData(prev => ({
                    ...prev,
                    email: profile.email || session.user.email || '',
                    name: profile.full_name || ''
                }))
            } else {
                setFormData(prev => ({
                    ...prev,
                    email: session.user.email || ''
                }))
            }
        }
        checkUser()
    }, [router])

    // Only require plan params if not renewing (renewal flow doesn't need them)
    if (!membershipId && (!planId || !planType || !planName || !price || !duration)) {
        return (
            <>
                <Navbar />
                <div className={styles.container}>
                    <div className={styles.error}>
                        <p>Invalid plan selection. Please select a plan from the membership page.</p>
                        <a href="/membership" className={styles.backButton}>Go to Membership Plans</a>
                    </div>
                </div>
                <Footer />
            </>
        )
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target
        const checked = (e.target as HTMLInputElement).checked

        if (type === 'checkbox') {
            if (name.startsWith('medicalCondition_')) {
                const conditionName = name.replace('medicalCondition_', '')
                setFormData(prev => ({
                    ...prev,
                    medicalConditions: {
                        ...prev.medicalConditions,
                        [conditionName]: {
                            checked,
                            details: prev.medicalConditions[conditionName]?.details || ''
                        }
                    }
                }))
            } else if (name.startsWith('foodPreparation_')) {
                const prepType = name.replace('foodPreparation_', '')
                setFormData(prev => ({
                    ...prev,
                    foodPreparation: checked
                        ? [...prev.foodPreparation, prepType]
                        : prev.foodPreparation.filter(p => p !== prepType)
                }))
            } else if (name.startsWith('activityRestriction_')) {
                const restriction = name.replace('activityRestriction_', '')
                setFormData(prev => ({
                    ...prev,
                    activityRestrictions: checked
                        ? [...(prev.activityRestrictions || []), restriction]
                        : (prev.activityRestrictions || []).filter(r => r !== restriction)
                }))
            } else {
                setFormData(prev => ({ ...prev, [name]: checked }))
            }
        } else {
            // Handle activityRestrictions as comma-separated string
            if (name === 'activityRestrictions') {
                const restrictions = value.split(',').map(r => r.trim()).filter(r => r)
                setFormData(prev => ({ ...prev, activityRestrictions: restrictions }))
            } else {
                setFormData(prev => ({ ...prev, [name]: value }))
            }
        }
    }

    const handleFamilyHistoryChange = (condition: string, field: string, value: string | boolean) => {
        setFormData(prev => ({
            ...prev,
            familyHistory: {
                ...prev.familyHistory,
                [condition]: {
                    ...prev.familyHistory[condition as keyof typeof prev.familyHistory],
                    [field]: value
                }
            }
        }))
    }

    const handleMedicalConditionDetails = (condition: string, details: string) => {
        setFormData(prev => ({
            ...prev,
            medicalConditions: {
                ...prev.medicalConditions,
                [condition]: {
                    checked: prev.medicalConditions[condition]?.checked || false,
                    details
                }
            }
        }))
    }

    // Validation function for each section
    const validateSection = (sectionIndex: number): { isValid: boolean; errors: string[] } => {
        const errors: string[] = []

        switch (sectionIndex) {
            case 0: // Personal Information
                if (!formData.name?.trim()) errors.push('Name is required')
                if (!formData.date) errors.push('Date is required')
                if (!formData.dateOfBirth) errors.push('Date of Birth is required')
                if (!formData.email?.trim()) errors.push('Email is required')
                if (!formData.phone?.trim()) errors.push('Phone Number is required')
                if (!formData.age) errors.push('Age is required')
                if (!formData.gender) errors.push('Gender is required')
                if (!formData.address?.trim()) errors.push('Address is required')
                if (!formData.city?.trim()) errors.push('City is required')
                if (!formData.state?.trim()) errors.push('State is required')
                if (!formData.pincode?.trim()) errors.push('Pincode is required')
                if (!formData.emergencyContact?.trim()) errors.push('Emergency Contact Name is required')
                if (!formData.emergencyPhone?.trim()) errors.push('Emergency Contact Phone is required')
                break

            case 1: // Medical Information
                if (!formData.presentHealthState) errors.push('Present State of Health is required')
                if (!formData.medicationAdherence) errors.push('Medication Adherence is required')
                if (!formData.supplements) errors.push('Supplements question is required')
                if (!formData.cholesterolChecked) errors.push('Cholesterol Checked question is required')
                if (!formData.bloodSugarChecked) errors.push('Blood Sugar Checked question is required')
                break

            case 2: // Family History - No required fields, all optional
                break

            case 3: // Nutrition
                if (!formData.dietaryGoals?.trim()) errors.push('Dietary goals is required')
                if (!formData.modifiedDiet) errors.push('Modified diet question is required')
                if (!formData.specializedEatingPlan) errors.push('Specialized eating plan question is required')
                if (!formData.dietitianConsultation) errors.push('Dietitian consultation question is required')
                if (!formData.foodAllergies) errors.push('Food allergies question is required')
                if (!formData.foodCravings) errors.push('Food cravings question is required')
                break

            case 4: // Substance-related Habits
                if (!formData.alcohol) errors.push('Alcohol question is required')
                if (!formData.caffeinatedBeverages) errors.push('Caffeinated beverages question is required')
                if (!formData.tobacco) errors.push('Tobacco question is required')
                break

            case 5: // Physical Activity
                if (!formData.structuredActivity) errors.push('Structured activity question is required')
                if (!formData.otherPhysicalActivity) errors.push('Other physical activity question is required')
                if (!formData.activityInjuries) errors.push('Activity injuries question is required')
                break

            case 6: // Occupational
                if (!formData.work) errors.push('Work question is required')
                break

            case 7: // Sleep and Stress
                if (!formData.stressAppetite) errors.push('Stress appetite question is required')
                break

            case 8: // Weight History
                if (!formData.weightGoal) errors.push('Weight goal is required')
                break

            case 9: // Goals
                if (!formData.specificHealthGoals) errors.push('Specific health goals question is required')
                if (!formData.weightLossGoal) errors.push('Weight loss goal question is required')
                break
        }

        return {
            isValid: errors.length === 0,
            errors
        }
    }

    const handleNext = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        e.stopPropagation()

        const validation = validateSection(currentSection)
        if (!validation.isValid) {
            showToast('Please fill in all required fields', 'error')
            return
        }

        setCurrentSection(currentSection + 1)
    }

    const handleSectionNavigation = (targetSection: number) => {
        // If clicking on current section, do nothing
        if (targetSection === currentSection) {
            return
        }

        // If going backwards, allow it (users can go back to edit previous sections)
        if (targetSection < currentSection) {
            setCurrentSection(targetSection)
            return
        }

        // If going forward, validate current section first
        const validation = validateSection(currentSection)
        if (!validation.isValid) {
            showToast('Please fill in all required fields', 'error')
            return
        }

        // If validation passes, allow navigation
        setCurrentSection(targetSection)
    }

    // Load existing membership data if renewing
    useEffect(() => {
        const loadExistingMembership = async () => {
            if (membershipId && renew) {
                const { data: membershipData, error } = await supabase
                    .from('memberships')
                    .select('*')
                    .eq('id', membershipId)
                    .single()

                if (!error && membershipData) {
                    setExistingMembership(membershipData)
                    // Pre-fill form with existing data if available
                    if (membershipData.form_data) {
                        setFormData(prev => ({
                            ...prev,
                            ...membershipData.form_data
                        }))
                    }
                }
            }
        }

        if (user) {
            loadExistingMembership()
        }
    }, [user, membershipId, renew])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            // Validate required fields
            if (!formData.name || !formData.email || !formData.phone || !formData.dateOfBirth || !formData.gender) {
                showToast('Please fill in all required personal information fields', 'error')
                setLoading(false)
                return
            }

            // Generate PDF
            const pdfDoc = generateMembershipFormPDF(
                formData,
                existingMembership?.plan_name || planName,
                existingMembership?.plan_type || planType
            )
            const pdfBlob = pdfDoc.output('blob')
            const fileName = `${user.id}/membership-form-${Date.now()}.pdf`

            // Upload PDF to Supabase Storage (with user ID folder)
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('membership-forms')
                .upload(fileName, pdfBlob, {
                    contentType: 'application/pdf',
                    upsert: false
                })

            if (uploadError) {
                console.error('Error uploading PDF:', uploadError)
                // Continue even if PDF upload fails
            }

            // Get PDF URL (will be private, we'll use signed URLs later)
            const pdfPath = uploadData?.path || null

            // Old renewal system removed - renewals now handled via contact page

            // Otherwise, create new membership record
            // NOTE: Status is set to 'awaiting_payment' - admin will NOT see this until payment is submitted
            // No notifications are sent here - notifications only sent when payment is submitted
            const { data: membership, error: membershipError } = await supabase
                .from('memberships')
                .insert({
                    user_id: user.id,
                    plan_type: planType,
                    plan_name: (planName || existingMembership?.plan_name || '').toLowerCase(),
                    duration_months: (duration || existingMembership?.duration_months?.toString() || '12').includes('3') ? 3 : (duration || '').includes('6') ? 6 : 12,
                    price: parseFloat(price || existingMembership?.price?.toString() || '0'),
                    status: 'awaiting_payment', // Changed from 'pending' - admin won't see this until payment submitted
                    form_data: formData, // Store comprehensive form data as JSONB
                    form_pdf_path: pdfPath // Store PDF path for later access
                })
                .select()
                .single()

            if (membershipError) throw membershipError

            // IMPORTANT: No notifications sent here - admin will only be notified when payment is submitted
            // Redirect to payment page
            router.push(`/membership/payment?membershipId=${membership.id}`)
        } catch (error: any) {
            console.error('Error submitting form:', error)
            showToast(`Error: ${error.message}`, 'error')
            setLoading(false)
        }
    }

    // Render form sections - Due to size, I'll create a simplified version here
    // The full form would be very long, so I'll create the structure and you can expand
    return (
        <>
            <Navbar />
            <div className={styles.container}>
                <div className={styles.header}>
                    <button onClick={() => router.back()} className={styles.backButton}>
                        <ArrowLeft size={20} />
                        Back
                    </button>
                    <h1 className={styles.title}>
                        {membershipId && renew ? 'Update Membership Form' : 'Membership Application Form'}
                    </h1>
                    {membershipId && renew && (
                        <p style={{ margin: '0.5rem 0', color: '#64748b', fontSize: '0.875rem' }}>
                            Update your information before renewing your {renew === 'trainer' ? 'trainer access' : 'membership plan'}
                        </p>
                    )}
                    <div className={styles.planInfo}>
                        <span className={styles.planBadge}>
                            {existingMembership?.plan_name || planName} Plan
                        </span>
                        <span className={styles.planType}>
                            {(existingMembership?.plan_type || planType) === 'online' ? 'Online' : 'In-Gym'}
                        </span>
                        {price && (
                            <span className={styles.planPrice}>₹{parseFloat(price).toLocaleString()}</span>
                        )}
                    </div>
                    <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${((currentSection + 1) / sections.length) * 100}%` }}></div>
                    </div>
                    <div className={styles.sectionNav}>
                        {sections.map((section, idx) => (
                            <button
                                key={idx}
                                type="button"
                                className={`${styles.sectionNavBtn} ${currentSection === idx ? styles.active : ''}`}
                                onClick={() => handleSectionNavigation(idx)}
                            >
                                {section}
                            </button>
                        ))}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    {/* Section 1: Personal Information */}
                    {currentSection === 0 && (
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>Personal Information</h2>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label htmlFor="name">Name *</label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="date">Date *</label>
                                    <input
                                        type="date"
                                        id="date"
                                        name="date"
                                        value={formData.date}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="dateOfBirth">Date of Birth *</label>
                                    <input
                                        type="date"
                                        id="dateOfBirth"
                                        name="dateOfBirth"
                                        value={formData.dateOfBirth}
                                        onChange={handleChange}
                                        required
                                        max={new Date().toISOString().split('T')[0]}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="email">Email *</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="phone">Phone Number *</label>
                                    <input
                                        type="tel"
                                        id="phone"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="age">Age *</label>
                                    <input
                                        type="number"
                                        id="age"
                                        name="age"
                                        value={formData.age}
                                        onChange={handleChange}
                                        min="16"
                                        max="100"
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="gender">Gender *</label>
                                    <select
                                        id="gender"
                                        name="gender"
                                        value={formData.gender}
                                        onChange={handleChange}
                                        required
                                    >
                                        <option value="">Select Gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                        <option value="prefer_not_to_say">Prefer not to say</option>
                                    </select>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label htmlFor="address">Address *</label>
                                    <textarea
                                        id="address"
                                        name="address"
                                        value={formData.address}
                                        onChange={handleChange}
                                        rows={3}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="city">City *</label>
                                    <input
                                        type="text"
                                        id="city"
                                        name="city"
                                        value={formData.city}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="state">State *</label>
                                    <input
                                        type="text"
                                        id="state"
                                        name="state"
                                        value={formData.state}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="pincode">Pincode *</label>
                                    <input
                                        type="text"
                                        id="pincode"
                                        name="pincode"
                                        value={formData.pincode}
                                        onChange={handleChange}
                                        pattern="[0-9]{6}"
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="emergencyContact">Emergency Contact Name *</label>
                                    <input
                                        type="text"
                                        id="emergencyContact"
                                        name="emergencyContact"
                                        value={formData.emergencyContact}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="emergencyPhone">Emergency Contact Phone *</label>
                                    <input
                                        type="tel"
                                        id="emergencyPhone"
                                        name="emergencyPhone"
                                        value={formData.emergencyPhone}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Render other sections using FormSections component */}
                    {currentSection > 0 && renderFormSection({
                        formData,
                        handleChange,
                        handleFamilyHistoryChange,
                        handleMedicalConditionDetails,
                        currentSection
                    })}

                    <div className={styles.formActions}>
                        {currentSection > 0 && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setCurrentSection(currentSection - 1)
                                }}
                                className={styles.cancelButton}
                            >
                                Previous
                            </button>
                        )}
                        {currentSection < sections.length - 1 ? (
                            <button
                                type="button"
                                onClick={handleNext}
                                className={styles.submitButton}
                            >
                                Next
                            </button>
                        ) : (
                            <button type="submit" className={styles.submitButton} disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className={styles.spinner} size={20} />
                                        Processing...
                                    </>
                                ) : (
                                    'Continue to Payment'
                                )}
                            </button>
                        )}
                    </div>
                </form>
            </div>

            <Toast message={toast} type={toastType} onClose={hideToast} />
            <Footer />
        </>
    )
}
