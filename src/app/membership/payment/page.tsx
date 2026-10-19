'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Loader2, Upload, X, Check } from 'lucide-react'
import Navbar from '@/components/Navbar/Navbar'
import Footer from '@/components/Footer/Footer'
import Toast from '@/components/Toast/Toast'
import { useToast } from '@/hooks/useToast'
import { isInGymAddonAvailable, isTrainerAddonAvailable, getBasePlanType } from '@/lib/addonEligibility'
import styles from './payment.module.css'

interface Trainer {
    id: string
    name: string
    price: number
}

// Trainers will be fetched from API - no hardcoded values
const trainers: Trainer[] = []

function PaymentPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [membership, setMembership] = useState<any>(null)
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
    const [upiId, setUpiId] = useState<string | null>(null)
    const [upiMerchantName, setUpiMerchantName] = useState<string | null>(null)
    const [paymentInstructions, setPaymentInstructions] = useState<string | null>(null)
    const [paymentConfigError, setPaymentConfigError] = useState<string | null>(null)
    const [copiedUpi, setCopiedUpi] = useState(false)
    const { toast, toastType, showToast, hideToast } = useToast()
    const [paymentData, setPaymentData] = useState({
        transactionId: '',
        paymentDate: '',
        amount: ''
    })
    const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
    const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
    const [trainers, setTrainers] = useState<Trainer[]>([])
    // In-gym admission fee (fetch from database)
    const [inGymAdmissionFee, setInGymAdmissionFee] = useState(1200)
    const [inGymMonthlyFee, setInGymMonthlyFee] = useState(650)

    const [addons, setAddons] = useState({
        inGym: false,
        personalTrainer: false,
        selectedTrainer: null as string | null
    })

    const rawMembershipId = searchParams.get('membershipId')
    const membershipId = rawMembershipId ? (rawMembershipId.match(/^\d+/)?.[0] || rawMembershipId) : null
    const renewalType = searchParams.get('renewalType') || searchParams.get('renewType') || (searchParams.get('isRenewal') === 'true' ? 'membership' : null) // 'trainer' for trainer renewal or 'membership'
    const trainerId = searchParams.get('trainerId')
    const durationMonths = searchParams.get('durationMonths')
    const newPlanId = searchParams.get('newPlanId') || searchParams.get('renewPlanId')
    const newPlanName = searchParams.get('newPlanName') || searchParams.get('renewPlanName')
    const newPlanType = searchParams.get('newPlanType')
    const newDuration = searchParams.get('newDuration')
    const newPrice = searchParams.get('newPrice')
    const paramGender = searchParams.get('gender')

    const [hasExistingPendingPayment, setHasExistingPendingPayment] = useState(false)
    const [selectedRenewalPlan, setSelectedRenewalPlan] = useState<{
        key: string
        name: string
        planType: 'online' | 'in_gym'
        duration: string
        durationMonths: number
        price: number
    } | null>(null)
    const [userGender, setUserGender] = useState<'boys' | 'girls'>('boys')

    useEffect(() => {
        const fetchData = async () => {
            if (!membershipId) {
                router.push('/membership')
                return
            }

            try {
                // Fetch independent resources in parallel to eliminate waterfall latency
                const [
                    membershipRes,
                    pendingPaymentRes,
                    userRes,
                    feesRes,
                    trainersRes,
                    paymentConfigRes
                ] = await Promise.allSettled([
                    supabase.from('memberships').select('*').eq('id', membershipId).single(),
                    supabase.from('membership_payments').select('id, transaction_id, created_at').eq('membership_id', membershipId).eq('status', 'pending').limit(1).maybeSingle(),
                    supabase.auth.getUser(),
                    fetch('/api/fees').then(r => r.ok ? r.json() : null).catch(() => null),
                    fetch('/api/trainers').then(r => r.ok ? r.json() : null).catch(() => null),
                    fetch('/api/payment-qr').then(r => r.ok ? r.json() : null).catch(() => null),
                ]);

                // Validate membership
                if (membershipRes.status !== 'fulfilled' || membershipRes.value.error || !membershipRes.value.data) {
                    showToast('Membership not found', 'error')
                    setTimeout(() => router.push('/membership'), 2000)
                    return
                }

                const membershipData = membershipRes.value.data
                setMembership(membershipData)

                // Check pending payment
                if (pendingPaymentRes.status === 'fulfilled' && pendingPaymentRes.value.data) {
                    setHasExistingPendingPayment(true)
                }

                // Parse fees
                let currentAdmissionFee = 1200
                let currentMonthlyFee = 650
                if (feesRes.status === 'fulfilled' && feesRes.value?.success && feesRes.value.fees) {
                    currentAdmissionFee = feesRes.value.fees.admissionFee || 1200
                    currentMonthlyFee = feesRes.value.fees.monthlyFee || 650
                    setInGymAdmissionFee(currentAdmissionFee)
                    setInGymMonthlyFee(currentMonthlyFee)
                }

                // Parse trainers
                if (trainersRes.status === 'fulfilled' && trainersRes.value?.trainers) {
                    const trainersList = trainersRes.value.trainers.map((t: any) => ({
                        id: t.id,
                        name: t.name,
                        price: t.price || 0
                    }))
                    setTrainers(trainersList)
                }

                // Parse payment config - require both QR and UPI ID
                if (paymentConfigRes.status === 'fulfilled' && paymentConfigRes.value?.success) {
                    const config = paymentConfigRes.value
                    if (config.qrCodeUrl && config.upiId) {
                        setQrCodeUrl(config.qrCodeUrl)
                        setUpiId(config.upiId)
                        setUpiMerchantName(config.upiMerchantName || 'THE 24 FITNESS GYM')
                        setPaymentInstructions(config.instructions || null)
                        setPaymentConfigError(null)
                    } else {
                        setPaymentConfigError('Payment configuration is incomplete. The admin has not configured the official UPI ID or payment QR code in admin settings. Please contact gym administration.')
                    }
                } else {
                    setPaymentConfigError('Payment configuration is currently unavailable. Unable to retrieve official payment settings from the gym server.')
                }

                // Determine member gender for authoritative pricing
                let determinedGender: string | null = null
                const paramG = (paramGender || searchParams.get('gender') || '').toLowerCase()
                const planIdLower = (newPlanId || '').toLowerCase()
                const planNameLower = (newPlanName || membershipData.plan_name || '').toLowerCase()
                const formDataGender = (membershipData.form_data?.gender || '').toLowerCase()

                if (paramG === 'girls' || paramG === 'female' || paramG === 'girl' || paramG === 'f') {
                    determinedGender = 'girls'
                } else if (paramG === 'boys' || paramG === 'male' || paramG === 'boy' || paramG === 'm') {
                    determinedGender = 'boys'
                } else if (planIdLower.includes('girls') || planIdLower.includes('girl')) {
                    determinedGender = 'girls'
                } else if (planIdLower.includes('boys') || planIdLower.includes('boy')) {
                    determinedGender = 'boys'
                } else if (planNameLower.includes('girls') || planNameLower.includes('girl')) {
                    determinedGender = 'girls'
                } else if (planNameLower.includes('boys') || planNameLower.includes('boy')) {
                    determinedGender = 'boys'
                } else if (formDataGender === 'female' || formDataGender === 'f' || formDataGender === 'girl' || formDataGender === 'girls') {
                    determinedGender = 'girls'
                } else if (formDataGender === 'male' || formDataGender === 'm' || formDataGender === 'boy' || formDataGender === 'boys') {
                    determinedGender = 'boys'
                } else if (membershipData.price === 700 || membershipData.price === 1400 || membershipData.price === 2400 || membershipData.price === 4400 || membershipData.price === 7800) {
                    determinedGender = 'girls'
                }

                if (!determinedGender && userRes.status === 'fulfilled' && userRes.value?.data?.user) {
                    const u = userRes.value.data.user
                    const metaG = (u.user_metadata?.gender || '').toLowerCase()
                    if (metaG === 'female' || metaG === 'f' || metaG === 'girls') {
                        determinedGender = 'girls'
                    } else if (metaG === 'male' || metaG === 'm' || metaG === 'boys') {
                        determinedGender = 'boys'
                    }
                }

                const isFemale = determinedGender === 'girls'
                setUserGender(isFemale ? 'girls' : 'boys')

                // Calculate renewal price and initialize dynamic tier plan state
                let renewalAmount = membershipData.price
                let initialPlan: {
                    key: string
                    name: string
                    planType: 'online' | 'in_gym'
                    duration: string
                    durationMonths: number
                    price: number
                }

                const targetPlan = (newPlanName || membershipData.plan_name || '').toLowerCase()
                if (targetPlan.includes('elite')) {
                    renewalAmount = isFemale ? 7800 : 6800
                    initialPlan = {
                        key: 'elite',
                        name: 'Elite',
                        planType: 'online',
                        duration: '12 Months',
                        durationMonths: 12,
                        price: renewalAmount
                    }
                } else if (targetPlan.includes('premium')) {
                    renewalAmount = isFemale ? 4400 : 4000
                    initialPlan = {
                        key: 'premium',
                        name: 'Premium',
                        planType: 'online',
                        duration: '6 Months',
                        durationMonths: 6,
                        price: renewalAmount
                    }
                } else if (targetPlan.includes('basic')) {
                    renewalAmount = isFemale ? 2400 : 2200
                    initialPlan = {
                        key: 'basic',
                        name: 'Basic',
                        planType: 'online',
                        duration: '3 Months',
                        durationMonths: 3,
                        price: renewalAmount
                    }
                } else {
                    renewalAmount = isFemale ? 700 : (currentMonthlyFee || 650)
                    initialPlan = {
                        key: 'regular',
                        name: 'Regular Monthly',
                        planType: 'in_gym',
                        duration: '1 Month',
                        durationMonths: 1,
                        price: renewalAmount
                    }
                }

                if (newPrice && !targetPlan.includes('regular') && !targetPlan.includes('basic') && !targetPlan.includes('premium') && !targetPlan.includes('elite')) {
                    renewalAmount = parseFloat(newPrice)
                    initialPlan.price = renewalAmount
                }

                setSelectedRenewalPlan(initialPlan)

                console.log('[PAYMENT] Final renewal amount:', renewalAmount, 'Selected tier:', initialPlan.name)
                setPaymentData(prev => ({
                    ...prev,
                    amount: renewalAmount.toString()
                }))
            } catch (err: any) {
                console.error('[PAYMENT] Error initializing payment page:', err)
                showToast('Failed to load payment details', 'error')
            }
        }

        fetchData()
    }, [membershipId, router])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            showToast('Please upload an image file', 'error')
            return
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast('File size must be less than 5MB', 'error')
            return
        }

        setScreenshotFile(file)
        const reader = new FileReader()
        reader.onloadend = () => {
            setScreenshotPreview(reader.result as string)
        }
        reader.readAsDataURL(file)
    }

    const removeScreenshot = () => {
        setScreenshotFile(null)
        setScreenshotPreview(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            if (!paymentData.transactionId || !paymentData.paymentDate) {
                showToast('Please fill in transaction ID and payment date', 'error')
                setLoading(false)
                return
            }

            if (!screenshotFile) {
                showToast('Please upload payment screenshot', 'error')
                setLoading(false)
                return
            }

            // Upload screenshot
            setUploading(true)
            const { data: { session: uploadSession } } = await supabase.auth.getSession()
            if (!uploadSession) {
                router.push('/signup')
                return
            }

            const fileExt = screenshotFile.name.split('.').pop()
            const fileName = `${uploadSession.user.id}/${membershipId}/${Date.now()}.${fileExt}`

            const { error: uploadError } = await supabase.storage
                .from('payment-screenshots')
                .upload(fileName, screenshotFile, {
                    cacheControl: '3600',
                    upsert: false
                })

            if (uploadError) throw uploadError

            // Since bucket is private, we need to store the path, not public URL
            // Admin will access via API route with signed URL
            const screenshotPath = fileName

            // Submit payment via API route (handles payment creation, status update, addons, and notifications)
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Not authenticated')

            // Handle trainer renewal differently
            if (renewalType === 'trainer' && trainerId && durationMonths) {
                const submitResponse = await fetch(`/api/memberships/${membershipId}/renew-trainer`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        transactionId: paymentData.transactionId,
                        paymentDate: paymentData.paymentDate,
                        amount: totalAmount,
                        screenshotPath: screenshotPath,
                        trainerId: trainerId,
                        durationMonths: parseInt(durationMonths)
                    })
                })

                if (!submitResponse.ok) {
                    let errorMessage = 'Failed to submit trainer renewal payment';
                    try {
                        const errorData = await submitResponse.json();
                        errorMessage = errorData.error || errorMessage;
                        console.error('Error submitting trainer renewal payment:', errorData);
                    } catch (parseError) {
                        console.error('Error parsing error response:', parseError);
                        const errorText = await submitResponse.text();
                        errorMessage = errorText || errorMessage;
                        console.error('Raw error response:', errorText);
                    }
                    throw new Error(errorMessage);
                }

                const submitResult = await submitResponse.json()
                console.log('Trainer renewal payment submitted successfully:', submitResult)

                // Send broadcast to admin
                const adminChannel = supabase.channel('admin_notifications_bell')
                await adminChannel.subscribe()
                await new Promise(resolve => setTimeout(resolve, 150))
                await adminChannel.send({
                    type: 'broadcast',
                    event: 'admin_notification',
                    payload: {
                        type: 'trainer_renewal_payment_submitted',
                        content: `A user has submitted a trainer renewal payment. Please verify.`,
                        membershipId: membershipId
                    }
                })
                await adminChannel.unsubscribe()

                showToast('Trainer renewal payment submitted successfully! Admin will verify and activate your trainer access soon. 🎉', 'success')
                setTimeout(() => router.push('/dashboard'), 2000)
                return
            }

            // Regular membership payment submission
            const payload: any = {
                transactionId: paymentData.transactionId,
                paymentDate: paymentData.paymentDate,
                amount: totalAmount,
                screenshotPath: screenshotPath,
                addons: {
                    inGym: addons.inGym,
                    personalTrainer: addons.personalTrainer,
                    selectedTrainer: addons.selectedTrainer
                }
            }

            const currentPlanName = (membership.plan_name || '').toLowerCase()
            const activePlanName = selectedRenewalPlan ? selectedRenewalPlan.name : (newPlanName || membership.plan_name)
            const activePlanType = selectedRenewalPlan ? selectedRenewalPlan.planType : (newPlanType || membership.plan_type || 'in_gym')
            const activeDurationMonths = selectedRenewalPlan
                ? selectedRenewalPlan.durationMonths
                : (newDuration?.includes('12') ? 12 : newDuration?.includes('6') ? 6 : newDuration?.includes('3') ? 3 : 1)

            const isPlanSwitched = activePlanName.toLowerCase() !== currentPlanName ||
                (selectedRenewalPlan && selectedRenewalPlan.planType !== (membership.plan_type || ''))

            if (isPlanSwitched) {
                payload.newPlan = {
                    planName: activePlanName,
                    planType: activePlanType,
                    durationMonths: activeDurationMonths,
                    price: basePlanPrice
                }
            }

            const submitResponse = await fetch(`/api/memberships/${membershipId}/submit-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(payload)
            })

            if (!submitResponse.ok) {
                const errorData = await submitResponse.json().catch(() => ({}))
                console.error('Error submitting payment:', errorData)
                throw new Error(errorData.error || 'Failed to submit payment')
            }

            const submitResult = await submitResponse.json()
            console.log('Payment submitted successfully:', submitResult)

            // Send broadcast to admin for real-time notification
            const adminChannel = supabase.channel('admin_notifications_bell')
            await adminChannel.subscribe()
            await new Promise(resolve => setTimeout(resolve, 150))
            await adminChannel.send({
                type: 'broadcast',
                event: 'admin_notification',
                payload: {
                    type: 'new_membership_payment',
                    content: `A user has submitted payment for ${activePlanName} membership. Please verify.`,
                    membershipId: membershipId
                }
            })
            await adminChannel.unsubscribe()

            showToast('Payment submitted successfully! Admin will verify and activate your membership soon. 🎉', 'success')
            setTimeout(() => router.push('/dashboard'), 2000)
        } catch (error: any) {
            console.error('Error submitting payment:', error)
            showToast(`Error: ${error.message}`, 'error')
            setLoading(false)
            setUploading(false)
        }
    }

    const isFemale = userGender === 'girls'
    const availablePlans = [
        {
            key: 'regular',
            name: 'Regular Monthly',
            planType: 'in_gym' as const,
            duration: '1 Month',
            durationMonths: 1,
            price: isFemale ? 700 : inGymMonthlyFee
        },
        {
            key: 'basic',
            name: 'Basic',
            planType: 'online' as const,
            duration: '3 Months',
            durationMonths: 3,
            price: isFemale ? 2400 : 2200
        },
        {
            key: 'premium',
            name: 'Premium',
            planType: 'online' as const,
            duration: '6 Months',
            durationMonths: 6,
            price: isFemale ? 4400 : 4000
        },
        {
            key: 'elite',
            name: 'Elite',
            planType: 'online' as const,
            duration: '12 Months',
            durationMonths: 12,
            price: isFemale ? 7800 : 6800
        }
    ]

    const handleSwitchGender = (newGender: 'boys' | 'girls') => {
        setUserGender(newGender)
        const female = newGender === 'girls'
        if (selectedRenewalPlan) {
            let updatedPrice = selectedRenewalPlan.price
            if (selectedRenewalPlan.key === 'elite') {
                updatedPrice = female ? 7800 : 6800
            } else if (selectedRenewalPlan.key === 'premium') {
                updatedPrice = female ? 4400 : 4000
            } else if (selectedRenewalPlan.key === 'basic') {
                updatedPrice = female ? 2400 : 2200
            } else {
                updatedPrice = female ? 700 : inGymMonthlyFee
            }
            setSelectedRenewalPlan(prev => prev ? ({
                ...prev,
                price: updatedPrice
            }) : null)
            setPaymentData(prev => ({
                ...prev,
                amount: updatedPrice.toString()
            }))
        }
    }

    const handleSwitchPlan = (p: typeof availablePlans[0]) => {
        setSelectedRenewalPlan(p)
        setPaymentData(prev => ({
            ...prev,
            amount: p.price.toString()
        }))
        if (p.planType === 'in_gym') {
            setAddons(prev => ({ ...prev, inGym: false }))
        }
    }

    if (!membership) {
        return (
            <>
                <Navbar />
                <div className={styles.container}>
                    <div className={styles.loading}>Loading...</div>
                </div>
                <Footer />
            </>
        )
    }

    // Calculate addon prices with dynamic plan selection
    const activeDisplayName = selectedRenewalPlan ? selectedRenewalPlan.name : (newPlanName || membership.plan_name)
    const activePlanType = selectedRenewalPlan ? selectedRenewalPlan.planType : (newPlanType || membership.plan_type || 'in_gym')
    const activeDurationText = selectedRenewalPlan ? selectedRenewalPlan.duration : (newDuration || (membership.duration_months === 3 ? '3 Months' : membership.duration_months === 6 ? '6 Months' : membership.duration_months === 12 ? '12 Months' : `${membership.duration_months} Months`))

    const isInherentlyInGymPlan = activePlanType === 'in_gym' || activeDisplayName.toLowerCase().includes('regular')
    // In-gym offline add-on has no extra fee (removed per gym specification)
    const inGymAddonPrice = 0
    
    let trainerAddonPrice = 0
    if (renewalType === 'trainer' && trainerId && durationMonths) {
        // Trainer renewal: calculate from trainer price and duration
        const trainer = trainers.find(t => t.id === trainerId)
        trainerAddonPrice = trainer ? trainer.price * parseInt(durationMonths) : 0
    } else {
        // Regular trainer addon
        trainerAddonPrice = addons.personalTrainer && addons.selectedTrainer
            ? trainers.find(t => t.id === addons.selectedTrainer)?.price || 0
            : 0
    }

    const basePlanPrice = renewalType === 'trainer' ? 0 : (selectedRenewalPlan ? selectedRenewalPlan.price : (parseFloat(paymentData.amount) || 0))
    const totalAmount = basePlanPrice + inGymAddonPrice + trainerAddonPrice

    // Determine display plan type
    const displayPlanType = activePlanType

    return (
        <>
            <Navbar />
            <div className={styles.container}>
                <div className={styles.header}>
                    <button onClick={() => router.back()} className={styles.backButton}>
                        <ArrowLeft size={20} />
                        Back
                    </button>
                    <h1 className={styles.title}>Complete Payment</h1>
                    <div className={styles.planSummary}>
                        <span className={styles.planName}>{activeDisplayName} Plan</span>
                        <span className={styles.planType}>{displayPlanType === 'online' ? 'Online' : 'In-Gym'}</span>
                    </div>
                </div>

                {/* Existing pending payment warning banner */}
                {hasExistingPendingPayment && (
                    <div style={{
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid #f59e0b',
                        borderRadius: '0.75rem',
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        color: '#fbbf24',
                        fontSize: '0.95rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}>
                        <span style={{ fontWeight: 700 }}>⚠️ Verification In Review:</span>
                        <span>A payment verification is already pending for this membership. Gym management will verify and activate your access. Duplicate submissions are disabled.</span>
                    </div>
                )}

                {/* Dynamic Tier Switcher Bar (Only for membership renewals/purchases) */}
                {renewalType !== 'trainer' && (
                    <div className={styles.planSelectorCard}>
                        <div className={styles.planSelectorHeader}>
                            <div>
                                <h2 className={styles.planSelectorTitle}>Select Membership Plan</h2>
                                <span className={styles.planSelectorHint}>Click any tier to switch dynamically</span>
                            </div>
                            <div className={styles.genderToggleWrap}>
                                <button
                                    type="button"
                                    onClick={() => handleSwitchGender('boys')}
                                    className={`${styles.genderToggleBtn} ${userGender === 'boys' ? styles.genderToggleBtnActive : ''}`}
                                >
                                    👦 Boys Plans
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSwitchGender('girls')}
                                    className={`${styles.genderToggleBtn} ${userGender === 'girls' ? styles.genderToggleBtnActive : ''}`}
                                >
                                    👧 Girls Plans
                                </button>
                            </div>
                        </div>
                        <div className={styles.planPillsGrid}>
                            {availablePlans.map((p) => {
                                const isSelected = selectedRenewalPlan?.key === p.key ||
                                    (p.key === 'regular' && (selectedRenewalPlan?.name.toLowerCase().includes('regular') || selectedRenewalPlan?.planType === 'in_gym')) ||
                                    (p.key !== 'regular' && selectedRenewalPlan?.name.toLowerCase().includes(p.key));
                                return (
                                    <button
                                        key={p.key}
                                        type="button"
                                        onClick={() => handleSwitchPlan(p)}
                                        className={`${styles.planPill} ${isSelected ? styles.planPillActive : ''}`}
                                    >
                                        <div className={styles.planPillText}>
                                            <span className={styles.planPillName}>{p.name}</span>
                                            <span className={styles.planPillDuration}>{p.duration}</span>
                                        </div>
                                        <span className={styles.planPillPrice}>₹{p.price.toLocaleString()}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Price Breakdown Section */}
                <div className={styles.priceBreakdown}>
                    <h2 className={styles.priceTitle}>Price Breakdown</h2>
                    <div className={styles.priceDetails}>
                        <div className={styles.priceRow}>
                            <span className={styles.priceLabel}>
                                {activeDisplayName.charAt(0).toUpperCase() + activeDisplayName.slice(1)} Plan ({activeDurationText})
                            </span>
                            <span className={styles.priceValue}>₹{basePlanPrice.toLocaleString()}</span>
                        </div>

                        {addons.personalTrainer && addons.selectedTrainer && (
                            <div className={styles.priceRow}>
                                <span className={styles.priceLabel}>
                                    Personal Trainer ({trainers.find(t => t.id === addons.selectedTrainer)?.name})
                                </span>
                                <span className={styles.priceValue}>₹{trainerAddonPrice.toLocaleString()}</span>
                            </div>
                        )}

                        <div className={styles.priceRowTotal}>
                            <span className={styles.totalLabel}>Total Amount</span>
                            <span className={styles.totalValue}>₹{totalAmount.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Add-ons Section - Separate Container - Hide for trainer renewals */}
                {renewalType !== 'trainer' && (
                <div className={styles.addonsContainer}>
                    <h2 className={styles.addonsTitle}>Add-On Options</h2>
                    <div className={styles.addonsSection}>

                        {/* Personal Trainer Add-on - Always available for all plans */}
                        {(() => {
                            // Determine eligibility based on plan configuration
                            // Trainer addon is always available, but we check for consistency
                            const planConfig = {
                                planName: membership.plan_name || '',
                                planType: membership.plan_type || '',
                                durationMonths: membership.duration_months
                            };
                            return isTrainerAddonAvailable(planConfig);
                        })() && (
                        <div className={styles.addonCard}>
                            <label className={styles.addonLabel}>
                                <input
                                    type="checkbox"
                                    checked={addons.personalTrainer}
                                    onChange={(e) => {
                                        const checked = e.target.checked
                                        setAddons(prev => ({
                                            ...prev,
                                            personalTrainer: checked,
                                            selectedTrainer: checked ? (prev.selectedTrainer || null) : null
                                        }))
                                    }}
                                    className={styles.checkbox}
                                />
                                <div className={styles.addonContent}>
                                    <h3>Personal Trainer Add-On</h3>
                                    <p>Get personalized training from certified trainers</p>
                                    <p className={styles.addonPrice}>Select trainer to see price</p>
                                </div>
                            </label>

                            {addons.personalTrainer && (
                                <div className={styles.trainerSelection}>
                                    <label className={styles.trainerLabel}>Select Trainer:</label>
                                    <div className={styles.trainerOptions}>
                                        {trainers.map(trainer => (
                                            <label
                                                key={trainer.id}
                                                className={`${styles.trainerOption} ${addons.selectedTrainer === trainer.id ? styles.selected : ''}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="trainer"
                                                    value={trainer.id}
                                                    checked={addons.selectedTrainer === trainer.id}
                                                    onChange={(e) => setAddons(prev => ({ ...prev, selectedTrainer: e.target.value }))}
                                                    className={styles.radio}
                                                />
                                                <div className={styles.trainerInfo}>
                                                    <span className={styles.trainerName}>{trainer.name}</span>
                                                    <span className={styles.trainerPrice}>₹{trainer.price.toLocaleString()}</span>
                                                </div>
                                                {addons.selectedTrainer === trainer.id && (
                                                    <Check size={20} className={styles.checkIcon} />
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        )}
                    </div>

                    {/* Total Amount Display after Add-ons */}
                    <div className={styles.totalAmountSection}>
                        <div className={styles.totalAmountRow}>
                            <span className={styles.totalLabel}>Total Amount:</span>
                            <span className={styles.totalPrice}>₹{totalAmount.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                )}

                <form onSubmit={handleSubmit} className={styles.form}>
                    {/* Payment Config Error Banner */}
                    {paymentConfigError && (
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid #ef4444',
                            borderRadius: '0.75rem',
                            padding: '1.25rem',
                            marginBottom: '1.5rem',
                            color: '#f87171',
                            fontSize: '0.95rem'
                        }}>
                            <div style={{ fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span>❌</span>
                                <span>Payment Configuration Error</span>
                            </div>
                            <div>{paymentConfigError}</div>
                        </div>
                    )}

                    {/* QR Code Section */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>Payment QR Code</h2>
                        <div className={styles.qrSection}>
                            {qrCodeUrl ? (
                                <img src={qrCodeUrl} alt="Payment QR Code" className={styles.qrCode} />
                            ) : (
                                <div className={styles.qrPlaceholder}>
                                    <p style={{ color: '#ef4444', fontWeight: 600 }}>QR Code Unavailable</p>
                                    <p className={styles.qrNote}>Official payment QR code is not configured in admin settings.</p>
                                </div>
                            )}

                            {upiId && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '1rem',
                                    marginTop: '1.25rem',
                                    padding: '0.75rem 1.25rem',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    borderRadius: '0.5rem',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    maxWidth: '380px',
                                    margin: '1.25rem auto 0 auto'
                                }}>
                                    <div style={{ textAlign: 'left' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Official UPI ID</div>
                                        <div style={{ fontWeight: 700, color: '#f3f4f6', fontFamily: 'monospace', fontSize: '1rem' }}>{upiId}</div>
                                        {upiMerchantName && (
                                            <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '2px' }}>{upiMerchantName}</div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (upiId) {
                                                navigator.clipboard.writeText(upiId)
                                                setCopiedUpi(true)
                                                showToast('UPI ID copied to clipboard', 'success')
                                                setTimeout(() => setCopiedUpi(false), 2000)
                                            }
                                        }}
                                        style={{
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '0.375rem',
                                            border: '1px solid #e11d48',
                                            background: copiedUpi ? '#e11d48' : 'transparent',
                                            color: '#fff',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        {copiedUpi ? 'Copied ✓' : 'Copy UPI'}
                                    </button>
                                </div>
                            )}

                            <p className={styles.qrInstructions}>
                                {paymentInstructions || 'Scan this QR code or transfer to the official UPI ID above. After payment, enter your 12-digit UTR reference below and upload the confirmation screenshot.'}
                            </p>
                        </div>
                    </div>

                    {/* Payment Details */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>Payment Details</h2>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label htmlFor="transactionId">Transaction ID (UTR) *</label>
                                <input
                                    type="text"
                                    id="transactionId"
                                    value={paymentData.transactionId}
                                    onChange={(e) => setPaymentData(prev => ({ ...prev, transactionId: e.target.value }))}
                                    required
                                    placeholder="Enter 12-digit UTR number"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="paymentDate">Payment Date *</label>
                                <input
                                    type="date"
                                    id="paymentDate"
                                    value={paymentData.paymentDate}
                                    onChange={(e) => setPaymentData(prev => ({ ...prev, paymentDate: e.target.value }))}
                                    required
                                    max={(() => {
                                        const today = new Date();
                                        const year = today.getFullYear();
                                        const month = String(today.getMonth() + 1).padStart(2, '0');
                                        const day = String(today.getDate()).padStart(2, '0');
                                        return `${year}-${month}-${day}`;
                                    })()}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="amount">Base Plan Amount (₹) *</label>
                                <input
                                    type="number"
                                    id="amount"
                                    value={paymentData.amount}
                                    onChange={(e) => setPaymentData(prev => ({ ...prev, amount: e.target.value }))}
                                    required
                                    min="0"
                                    step="0.01"
                                    readOnly
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="totalAmount">Total Amount (₹) *</label>
                                <input
                                    type="number"
                                    id="totalAmount"
                                    value={totalAmount.toFixed(2)}
                                    readOnly
                                    className={styles.totalAmountInput}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Screenshot Upload */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>Payment Screenshot</h2>
                        <div className={styles.uploadSection}>
                            {screenshotPreview ? (
                                <div className={styles.previewContainer}>
                                    <img src={screenshotPreview} alt="Payment screenshot" className={styles.previewImage} />
                                    <button
                                        type="button"
                                        onClick={removeScreenshot}
                                        className={styles.removeButton}
                                    >
                                        <X size={20} />
                                        Remove
                                    </button>
                                </div>
                            ) : (
                                <label htmlFor="screenshot" className={styles.uploadLabel}>
                                    <Upload size={24} />
                                    <span>Upload Payment Screenshot</span>
                                    <input
                                        type="file"
                                        id="screenshot"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className={styles.fileInput}
                                    />
                                </label>
                            )}
                            <p className={styles.uploadNote}>
                                Please upload a clear screenshot of your payment confirmation. Maximum file size: 5MB
                            </p>
                        </div>
                    </div>

                    <div className={styles.formActions}>
                        <button type="button" onClick={() => router.back()} className={styles.cancelButton}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className={styles.submitButton}
                            disabled={loading || uploading || hasExistingPendingPayment || Boolean(paymentConfigError)}
                            style={hasExistingPendingPayment || Boolean(paymentConfigError) ? { opacity: 0.6, cursor: 'not-allowed', background: '#4b5563' } : undefined}
                        >
                            {hasExistingPendingPayment ? (
                                'Verification Pending Approval'
                            ) : paymentConfigError ? (
                                'Payment Unavailable (Config Error)'
                            ) : loading || uploading ? (
                                <>
                                    <Loader2 className={styles.spinner} size={20} />
                                    {uploading ? 'Uploading...' : 'Submitting...'}
                                </>
                            ) : (
                                'Submit Payment'
                            )}
                        </button>
                    </div>
                </form>
            </div>
            <Toast message={toast} type={toastType} onClose={hideToast} />
            <Footer />
        </>
    )
}

export default function PaymentPage() {
    return (
        <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                <Loader2 className={styles.spinner} size={40} />
            </div>
        }>
            <PaymentPageContent />
        </Suspense>
    )
}

