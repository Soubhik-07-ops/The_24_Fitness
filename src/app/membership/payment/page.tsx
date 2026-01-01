'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Loader2, Upload, X, Check } from 'lucide-react'
import Navbar from '@/components/Navbar/Navbar'
import Footer from '@/components/Footer/Footer'
import Toast from '@/components/Toast/Toast'
import { useToast } from '@/hooks/useToast'
import styles from './payment.module.css'

interface Trainer {
    id: string
    name: string
    price: number
}

// Trainers will be fetched from API - no hardcoded values
const trainers: Trainer[] = []

export default function PaymentPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [membership, setMembership] = useState<any>(null)
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
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

    useEffect(() => {
        // Fetch fees from public API
        const fetchFees = async () => {
            try {
                const response = await fetch('/api/fees')
                const data = await response.json()
                if (data.success && data.fees) {
                    setInGymAdmissionFee(data.fees.admissionFee || 1200)
                    setInGymMonthlyFee(data.fees.monthlyFee || 650)
                }
            } catch (error) {
                console.error('Error fetching fees:', error)
            }
        }
        fetchFees()
    }, [])
    const [addons, setAddons] = useState({
        inGym: false,
        personalTrainer: false,
        selectedTrainer: null as string | null
    })

    const membershipId = searchParams.get('membershipId')

    useEffect(() => {
        const fetchData = async () => {
            if (!membershipId) {
                router.push('/membership')
                return
            }

            // Fetch membership details
            const { data: membershipData, error: membershipError } = await supabase
                .from('memberships')
                .select('*')
                .eq('id', membershipId)
                .single()

            if (membershipError || !membershipData) {
                showToast('Membership not found', 'error')
                setTimeout(() => router.push('/membership'), 2000)
                return
            }

            setMembership(membershipData)
            setPaymentData(prev => ({
                ...prev,
                amount: membershipData.price.toString()
            }))

            // Fetch active trainers with prices from database
            try {
                const trainersResponse = await fetch('/api/trainers')
                if (trainersResponse.ok) {
                    const trainersData = await trainersResponse.json()
                    const trainersList = trainersData.trainers.map((t: any) => ({
                        id: t.id,
                        name: t.name,
                        price: t.price || 0 // Use price from database
                    }))
                    setTrainers(trainersList)
                }
            } catch (error) {
                console.error('Error fetching trainers:', error)
            }

            // Fetch QR code URL from API route (bypasses RLS)
            try {
                const qrResponse = await fetch('/api/payment-qr')
                if (qrResponse.ok) {
                    const qrData = await qrResponse.json()
                    if (qrData.success && qrData.qrCodeUrl) {
                        setQrCodeUrl(qrData.qrCodeUrl)
                    }
                }
            } catch (error) {
                console.error('Error fetching QR code:', error)
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

            const submitResponse = await fetch(`/api/memberships/${membershipId}/submit-payment`, {
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
                    addons: {
                        inGym: addons.inGym,
                        personalTrainer: addons.personalTrainer,
                        selectedTrainer: addons.selectedTrainer
                    }
                })
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
                    content: `A user has submitted payment for ${membership.plan_name} membership. Please verify.`,
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

    // Calculate addon prices
    // For in-gym plans, admission fee is automatically included
    // For online plans, user can optionally add in-gym addon
    const isInGymPlan = membership.plan_type === 'in_gym'
    const inGymAddonPrice = isInGymPlan ? inGymAdmissionFee : (addons.inGym ? inGymAdmissionFee : 0)
    const trainerAddonPrice = addons.personalTrainer && addons.selectedTrainer
        ? trainers.find(t => t.id === addons.selectedTrainer)?.price || 0
        : 0

    const basePlanPrice = parseFloat(paymentData.amount) || 0
    const totalAmount = basePlanPrice + inGymAddonPrice + trainerAddonPrice

    // Determine display plan type - if in-gym addon is selected, show as "In-Gym Training"
    const displayPlanType = addons.inGym ? 'in_gym' : membership.plan_type

    // Get plan duration in months for display
    const getDurationText = () => {
        if (membership.duration_months === 3) return '3 Months'
        if (membership.duration_months === 6) return '6 Months'
        if (membership.duration_months === 12) return '12 Months'
        return `${membership.duration_months} Months`
    }

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
                        <span className={styles.planName}>{membership.plan_name} Plan</span>
                        <span className={styles.planType}>{displayPlanType === 'online' ? 'Online' : 'In-Gym'}</span>
                    </div>
                </div>

                {/* Price Breakdown Section */}
                <div className={styles.priceBreakdown}>
                    <h2 className={styles.priceTitle}>Price Breakdown</h2>
                    <div className={styles.priceDetails}>
                        <div className={styles.priceRow}>
                            <span className={styles.priceLabel}>
                                {membership.plan_name.charAt(0).toUpperCase() + membership.plan_name.slice(1)} Plan ({getDurationText()})
                            </span>
                            <span className={styles.priceValue}>₹{basePlanPrice.toLocaleString()}</span>
                        </div>

                        {(isInGymPlan || addons.inGym) && (
                            <div className={styles.priceRow}>
                                <span className={styles.priceLabel}>
                                    {isInGymPlan ? 'In-Gym Admission Fee' : 'In-Gym Add-On (Admission Fee)'}
                                </span>
                                <span className={styles.priceValue}>₹{inGymAddonPrice.toLocaleString()}</span>
                            </div>
                        )}

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

                {/* Add-ons Section - Separate Container */}
                <div className={styles.addonsContainer}>
                    <h2 className={styles.addonsTitle}>Add-On Options</h2>
                    <div className={styles.addonsSection}>
                        {/* In-Gym Add-on - Only show for online plans */}
                        {membership.plan_type === 'online' && (
                            <div className={styles.addonCard}>
                                <label className={styles.addonLabel}>
                                    <input
                                        type="checkbox"
                                        checked={addons.inGym}
                                        onChange={(e) => setAddons(prev => ({ ...prev, inGym: e.target.checked }))}
                                        className={styles.checkbox}
                                    />
                                    <div className={styles.addonContent}>
                                        <h3>In-Gym (Offline) Add-On</h3>
                                        <p>Access to physical gym facilities</p>
                                        <p className={styles.addonPrice}>₹{inGymAdmissionFee.toLocaleString()} (Admission Fee)</p>
                                    </div>
                                </label>
                            </div>
                        )}

                        {/* Show info for in-gym plans */}
                        {isInGymPlan && (
                            <div className={styles.addonCard}>
                                <div className={styles.addonContent}>
                                    <h3>In-Gym Training Plan</h3>
                                    <p>This plan includes gym access with admission fee</p>
                                    <p className={styles.addonPrice}>Admission Fee: ₹{inGymAdmissionFee.toLocaleString()}</p>
                                    <p className={styles.addonPrice} style={{ marginTop: '0.5rem' }}>Monthly Fee: ₹{inGymMonthlyFee.toLocaleString()} after first month</p>
                                </div>
                            </div>
                        )}

                        {/* Personal Trainer Add-on */}
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
                    </div>

                    {/* Total Amount Display after Add-ons */}
                    <div className={styles.totalAmountSection}>
                        <div className={styles.totalAmountRow}>
                            <span className={styles.totalLabel}>Total Amount:</span>
                            <span className={styles.totalPrice}>₹{totalAmount.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    {/* QR Code Section */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>Payment QR Code</h2>
                        <div className={styles.qrSection}>
                            {qrCodeUrl ? (
                                <img src={qrCodeUrl} alt="Payment QR Code" className={styles.qrCode} />
                            ) : (
                                <div className={styles.qrPlaceholder}>
                                    <p>QR Code will be displayed here</p>
                                    <p className={styles.qrNote}>Admin will upload the QR code image</p>
                                </div>
                            )}
                            <p className={styles.qrInstructions}>
                                Scan this QR code to make your payment. After payment, fill in the details below and upload the screenshot.
                            </p>
                        </div>
                    </div>

                    {/* Payment Details */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>Payment Details</h2>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label htmlFor="transactionId">Transaction ID *</label>
                                <input
                                    type="text"
                                    id="transactionId"
                                    value={paymentData.transactionId}
                                    onChange={(e) => setPaymentData(prev => ({ ...prev, transactionId: e.target.value }))}
                                    required
                                    placeholder="Enter transaction ID"
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
                        <button type="submit" className={styles.submitButton} disabled={loading || uploading}>
                            {loading || uploading ? (
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

