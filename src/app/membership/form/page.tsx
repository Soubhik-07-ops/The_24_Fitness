'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Loader2, Languages } from 'lucide-react'
import Navbar from '@/components/Navbar/Navbar'
import Footer from '@/components/Footer/Footer'
import { renderFormSection } from '@/components/MembershipForm/FormSections'
import { generateMembershipFormPDF } from '@/lib/pdfGenerator'
import Toast from '@/components/Toast/Toast'
import { useToast } from '@/hooks/useToast'
import { getTranslation, type Language, translations } from '@/lib/formTranslations'
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

function MembershipFormContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [loading, setLoading] = useState(false)
    const [checkingAuth, setCheckingAuth] = useState(true)
    const [user, setUser] = useState<any>(null)
    const [currentSection, setCurrentSection] = useState(0)
    const [language, setLanguage] = useState<Language>('en')
    const { toast, toastType, showToast, hideToast } = useToast()

    const t = (key: keyof typeof translations.en) => getTranslation(language, key)

    const planId = searchParams.get('planId')
    const planType = searchParams.get('planType')
    const planName = searchParams.get('planName')
    const price = searchParams.get('price')
    const duration = searchParams.get('duration')
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
        t('personalInformation'),
        t('medicalInformation'),
        t('familyHistory'),
        t('nutrition'),
        t('substanceHabits'),
        t('physicalActivity'),
        t('occupational'),
        t('sleepAndStress'),
        t('weightHistory'),
        t('goals')
    ]

    useEffect(() => {
        const checkUser = async () => {
            setCheckingAuth(true)
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                // Preserve all plan parameters when redirecting to signup
                const currentParams = new URLSearchParams()
                if (planId) currentParams.set('planId', planId)
                if (planType) currentParams.set('planType', planType)
                if (planName) currentParams.set('planName', planName)
                if (price) currentParams.set('price', price)
                if (duration) currentParams.set('duration', duration)
                const redirectUrl = `/membership/form${currentParams.toString() ? `?${currentParams.toString()}` : ''}`
                router.push(`/signup?redirect=${encodeURIComponent(redirectUrl)}`)
                return
            }
            setUser(session.user)
            setCheckingAuth(false)

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
    }, [router, planId, planType, planName, price, duration])


    // Show loading state while checking authentication
    if (checkingAuth) {
        return (
            <>
                <Navbar />
                <div className={styles.container}>
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <p>{t('loading')}</p>
                    </div>
                </div>
                <Footer />
            </>
        )
    }

    // Only require plan params if not renewing (renewal flow doesn't need them)
    if (!planId || !planType || !planName || !price || !duration) {
        return (
            <>
                <Navbar />
                <div className={styles.container}>
                    <div className={styles.error}>
                        <p>{t('invalidPlanSelection')}</p>
                        <a href="/membership" className={styles.backButton}>{t('goToMembershipPlans')}</a>
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

        // Section 0: Personal Information - Required fields
        if (sectionIndex === 0) {
            if (!formData.name || formData.name.trim() === '') {
                errors.push(t('name') + ' is required')
            }
            if (!formData.dateOfBirth || formData.dateOfBirth.trim() === '') {
                errors.push(t('dateOfBirth') + ' is required')
            }
            if (!formData.email || formData.email.trim() === '') {
                errors.push(t('email') + ' is required')
            } else {
                // Basic email validation
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                if (!emailRegex.test(formData.email)) {
                    errors.push('Please enter a valid email address')
                }
            }
            if (!formData.phone || formData.phone.trim() === '') {
                errors.push(t('phoneNumber') + ' is required')
            } else {
                // Validate phone number (should be 10 digits)
                const phoneDigits = formData.phone.replace(/\D/g, '')
                if (phoneDigits.length !== 10) {
                    errors.push('Phone number must be exactly 10 digits')
                }
            }
            if (!formData.gender || formData.gender === '') {
                errors.push(t('gender') + ' is required')
            }
            if (!formData.address || formData.address.trim() === '') {
                errors.push(t('address') + ' is required')
            }
            if (!formData.city || formData.city.trim() === '') {
                errors.push(t('city') + ' is required')
            }
            if (!formData.state || formData.state.trim() === '') {
                errors.push(t('state') + ' is required')
            }
            if (!formData.pincode || formData.pincode.trim() === '') {
                errors.push(t('pincode') + ' is required')
            } else {
                // Validate pincode (should be 6 digits)
                const pincodeDigits = formData.pincode.replace(/\D/g, '')
                if (pincodeDigits.length !== 6) {
                    errors.push('Pincode must be exactly 6 digits')
                }
            }
        }

        // Section 1: Medical Information - Required fields
        if (sectionIndex === 1) {
            if (!formData.presentHealthState || formData.presentHealthState.trim() === '') {
                errors.push(t('presentHealthState') + ' is required')
            }
            if (!formData.medicationAdherence || formData.medicationAdherence.trim() === '') {
                errors.push(t('medicationAdherence') + ' is required')
            }
        }

        // Other sections can be optional or have specific validations as needed
        // For now, only Personal Information and Medical Information have required fields

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
            const errorMessage = validation.errors.length > 0
                ? validation.errors[0]
                : t('pleaseFillAllFields')
            showToast(errorMessage, 'error')
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
            const errorMessage = validation.errors.length > 0
                ? validation.errors[0]
                : t('pleaseFillAllFields')
            showToast(errorMessage, 'error')
            return
        }

        // If validation passes, allow navigation
        setCurrentSection(targetSection)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            // Validate all sections before submission
            for (let i = 0; i < sections.length; i++) {
                const validation = validateSection(i)
                if (!validation.isValid) {
                    const errorMessage = validation.errors.length > 0
                        ? validation.errors[0]
                        : `Please fill in all required fields in ${sections[i]} section`
                    showToast(errorMessage, 'error')
                    setLoading(false)
                    // Navigate to the section with errors
                    setCurrentSection(i)
                    return
                }
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

            // Check if user has any active or pending membership
            // New plan can only start after current plan's end date
            const { data: existingActiveMemberships, error: activeMembershipsError } = await supabase
                .from('memberships')
                .select('id, plan_name, status, membership_end_date, end_date, grace_period_end')
                .eq('user_id', user.id)
                .in('status', ['active', 'pending', 'awaiting_payment', 'grace_period'])
                .order('membership_end_date', { ascending: false })
                .order('end_date', { ascending: false });

            if (activeMembershipsError) {
                throw activeMembershipsError;
            }

            // Check if there's an active membership or grace period membership
            if (existingActiveMemberships && existingActiveMemberships.length > 0) {
                const now = new Date();
                now.setHours(0, 0, 0, 0);

                // First, check for grace_period status - block new purchases during grace period
                const gracePeriodMembership = existingActiveMemberships.find((m: any) => m.status === 'grace_period');
                if (gracePeriodMembership) {
                    const gracePeriodEnd = gracePeriodMembership.grace_period_end;
                    const daysRemaining = gracePeriodEnd
                        ? Math.ceil((new Date(gracePeriodEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                        : 0;

                    throw new Error(
                        `You cannot purchase a new plan while your membership is in grace period. ` +
                        `Please renew your existing membership instead of purchasing a new plan.`
                    );
                }

                // Check for active/pending memberships that haven't ended yet
                const activeMembership = existingActiveMemberships.find((m: any) => {
                    const endDate = m.membership_end_date || m.end_date;
                    if (!endDate) {
                        // If no end date, consider it active
                        return m.status === 'active' || m.status === 'pending';
                    }
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    return end >= now && (m.status === 'active' || m.status === 'pending');
                });

                if (activeMembership) {
                    const endDate = activeMembership.membership_end_date || activeMembership.end_date;
                    const endDateFormatted = endDate
                        ? new Date(endDate).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })
                        : 'N/A';

                    throw new Error(
                        `You already have an active ${activeMembership.plan_name} plan. ` +
                        `The new plan can only start after your current plan ends (${endDateFormatted}). ` +
                        `Please contact admin to remove the current plan if you want to buy a new plan now.`
                    );
                }
            }

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
                    duration_months: (duration || existingMembership?.duration_months?.toString() || '12').toLowerCase().includes('monthly') ? 1 : (duration || existingMembership?.duration_months?.toString() || '12').includes('3') ? 3 : (duration || '').includes('6') ? 6 : 12,
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
                        {t('back')}
                    </button>
                    <button
                        onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
                        className={styles.languageButton}
                        type="button"
                    >
                        <Languages size={18} />
                        {language === 'en' ? 'हिंदी' : 'English'}
                    </button>
                    <h1 className={styles.title}>
                        {t('membershipApplicationForm')}
                    </h1>
                    <div className={styles.planInfo}>
                        <span className={styles.planBadge}>
                            {existingMembership?.plan_name || planName} {t('plan')}
                        </span>
                        <span className={styles.planType}>
                            {(existingMembership?.plan_type || planType) === 'online' ? t('online') : t('inGym')}
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
                            <h2 className={styles.sectionTitle}>{t('personalInformation')}</h2>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label htmlFor="name">{t('name')} <span style={{ color: '#ff6b35' }}>*</span></label>
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
                                    <label htmlFor="date">{t('date')}</label>
                                    <input
                                        type="date"
                                        id="date"
                                        name="date"
                                        value={formData.date}
                                        onChange={handleChange}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="dateOfBirth">{t('dateOfBirth')} <span style={{ color: '#ff6b35' }}>*</span></label>
                                    <input
                                        type="date"
                                        id="dateOfBirth"
                                        name="dateOfBirth"
                                        value={formData.dateOfBirth}
                                        onChange={handleChange}
                                        max={new Date().toISOString().split('T')[0]}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="email">{t('email')} <span style={{ color: '#ff6b35' }}>*</span></label>
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
                                    <label htmlFor="phone">{t('phoneNumber')} <span style={{ color: '#ff6b35' }}>*</span></label>
                                    <input
                                        type="tel"
                                        id="phone"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        required
                                        pattern="[0-9]{10}"
                                        maxLength={10}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="age">{t('age')}</label>
                                    <input
                                        type="number"
                                        id="age"
                                        name="age"
                                        value={formData.age}
                                        onChange={handleChange}
                                        min="16"
                                        max="100"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="gender">{t('gender')} <span style={{ color: '#ff6b35' }}>*</span></label>
                                    <select
                                        id="gender"
                                        name="gender"
                                        value={formData.gender}
                                        onChange={handleChange}
                                        required
                                    >
                                        <option value="">{t('selectGender')}</option>
                                        <option value="male">{t('male')}</option>
                                        <option value="female">{t('female')}</option>
                                        <option value="other">{t('other')}</option>
                                        <option value="prefer_not_to_say">{t('preferNotToSay')}</option>
                                    </select>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label htmlFor="address">{t('address')} <span style={{ color: '#ff6b35' }}>*</span></label>
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
                                    <label htmlFor="city">{t('city')} <span style={{ color: '#ff6b35' }}>*</span></label>
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
                                    <label htmlFor="state">{t('state')} <span style={{ color: '#ff6b35' }}>*</span></label>
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
                                    <label htmlFor="pincode">{t('pincode')} <span style={{ color: '#ff6b35' }}>*</span></label>
                                    <input
                                        type="text"
                                        id="pincode"
                                        name="pincode"
                                        value={formData.pincode}
                                        onChange={handleChange}
                                        pattern="[0-9]{6}"
                                        maxLength={6}
                                        required
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="emergencyContact">{t('emergencyContactName')}</label>
                                    <input
                                        type="text"
                                        id="emergencyContact"
                                        name="emergencyContact"
                                        value={formData.emergencyContact}
                                        onChange={handleChange}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="emergencyPhone">{t('emergencyContactPhone')}</label>
                                    <input
                                        type="tel"
                                        id="emergencyPhone"
                                        name="emergencyPhone"
                                        value={formData.emergencyPhone}
                                        onChange={handleChange}
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
                        currentSection,
                        language
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
                                {t('previous')}
                            </button>
                        )}
                        {currentSection < sections.length - 1 ? (
                            <button
                                type="button"
                                onClick={handleNext}
                                className={styles.submitButton}
                            >
                                {t('next')}
                            </button>
                        ) : (
                            <button type="submit" className={styles.submitButton} disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className={styles.spinner} size={20} />
                                        {t('processing')}
                                    </>
                                ) : (
                                    t('continueToPayment')
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

export default function MembershipFormPage() {
    return (
        <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                <Loader2 className={styles.spinner} size={40} />
            </div>
        }>
            <MembershipFormContent />
        </Suspense>
    )
}
