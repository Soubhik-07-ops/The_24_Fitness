'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Download, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import styles from './InvoiceSection.module.css'

interface Invoice {
    id: string
    invoice_number: string
    invoice_type: string
    amount: number
    created_at: string
    pdf_url: string
}

interface InvoiceSectionProps {
    membershipId: number
}

export default function InvoiceSection({ membershipId }: InvoiceSectionProps) {
    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchInvoices = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            // Get auth token
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                setError('Not authenticated')
                return
            }

            const response = await fetch(`/api/invoices/${membershipId}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            })

            if (!response.ok) {
                throw new Error('Failed to fetch invoices')
            }

            const data = await response.json()
            setInvoices(data.invoices || [])
        } catch (err: any) {
            console.error('Error fetching invoices:', err)
            setError(err.message || 'Failed to load invoices')
        } finally {
            setLoading(false)
        }
    }, [membershipId])

    useEffect(() => {
        fetchInvoices()
    }, [fetchInvoices])

    // Real-time subscription for invoices
    useEffect(() => {
        if (!membershipId) return

        const channel = supabase
            .channel(`invoices-${membershipId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'invoices',
                    filter: `membership_id=eq.${membershipId}`
                },
                () => {
                    console.log('[INVOICES] Invoice changed, refreshing...')
                    fetchInvoices()
                }
            )
            .subscribe((status) => {
                console.log('[INVOICES] Subscription status:', status)
            })

        return () => {
            channel.unsubscribe()
        }
    }, [membershipId, fetchInvoices])

    const handleDownload = async (invoice: Invoice) => {
        try {
            // Get auth token
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                alert('Please log in to download invoices')
                return
            }

            // Use signed URL endpoint for secure download
            const response = await fetch(`/api/invoices/download/${invoice.id}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to download invoice' }))

                // If bucket not found, show helpful message
                if (errorData.error?.includes('bucket') || errorData.error?.includes('Bucket')) {
                    alert('Invoice storage bucket not found. Please contact admin to set up invoice storage.')
                } else {
                    alert(errorData.error || 'Failed to download invoice')
                }
                return
            }

            // Get signed URL from response
            const data = await response.json()
            if (data.success && data.downloadUrl) {
                // Open signed URL in new tab
                window.open(data.downloadUrl, '_blank')
            } else {
                alert('Failed to get download URL')
            }
        } catch (error: any) {
            console.error('Error downloading invoice:', error)
            alert('Failed to download invoice. Please try again.')
        }
    }

    const getInvoiceTypeLabel = (type: string): string => {
        const labels: Record<string, string> = {
            'membership': 'Membership Plan',
            'trainer_addon': 'Trainer Addon',
            'membership_renewal': 'Membership Renewal',
            'trainer_renewal': 'Trainer Access Renewal'
        }
        return labels[type] || type
    }

    if (loading) {
        return (
            <div className={styles.invoiceSection}>
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: '1rem' }}>Loading invoices...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className={styles.invoiceSection}>
                <div className={styles.errorMessage}>
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            </div>
        )
    }

    if (invoices.length === 0) {
        return (
            <div className={styles.invoiceSection}>
                <div className={styles.invoiceHeader}>
                    <div className={styles.invoiceTitle}>
                        <FileText size={20} />
                        <h4>Invoices</h4>
                    </div>
                </div>
                <div className={styles.emptyState}>
                    <FileText size={48} style={{ color: '#6b7280', marginBottom: '1rem', opacity: 0.5 }} />
                    <p style={{ color: '#9ca3af', fontSize: '0.9375rem', margin: 0 }}>
                        No invoices available yet. Invoices will be generated when your membership is approved or when you make payments.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.invoiceSection}>
            <div className={styles.invoiceHeader}>
                <div className={styles.invoiceTitle}>
                    <FileText size={18} />
                    <h4>Invoices</h4>
                </div>
                <div className={styles.invoiceWarning}>
                    <AlertCircle size={14} />
                    <span>Please download the invoice; it may be deleted later.</span>
                </div>
            </div>
            <div className={styles.invoiceList}>
                {invoices.map((invoice) => (
                    <div key={invoice.id} className={styles.invoiceItem}>
                        <div className={styles.invoiceInfo}>
                            <div className={styles.invoiceNumber}>
                                {invoice.invoice_number}
                            </div>
                            <div className={styles.invoiceDetails}>
                                <span className={styles.invoiceType}>
                                    {getInvoiceTypeLabel(invoice.invoice_type)}
                                </span>
                                <span className={styles.invoiceAmount}>
                                    ₹{invoice.amount.toLocaleString('en-IN')}
                                </span>
                                <span className={styles.invoiceDate}>
                                    {new Date(invoice.created_at).toLocaleDateString('en-IN', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => handleDownload(invoice)}
                            className={styles.downloadButton}
                            title="Download Invoice"
                        >
                            <Download size={16} />
                            Download
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}

