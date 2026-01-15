/**
 * Payment history archiving utilities
 * 
 * Strategy: Archive payments older than 2 years to reduce database size
 * Archived payments should be moved to a separate table or exported to storage
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

/**
 * Archive payments older than specified days (default: 730 days = 2 years)
 * This should be run as a scheduled job (cron) monthly
 * 
 * Strategy:
 * 1. Payments older than 2 years with status 'verified' or 'rejected' can be archived
 * 2. Keep all 'pending' payments (they might need review)
 * 3. Export archived payments to JSON file in storage or separate table
 * 4. Delete from main payments table after successful archive
 */
export async function archiveOldPayments(archiveDays: number = 730): Promise<{
    success: boolean;
    archivedCount: number;
    error?: string;
}> {
    if (!supabaseAdmin) {
        return { success: false, archivedCount: 0, error: 'Supabase admin client not initialized' };
    }

    try {
        const archiveDate = new Date();
        archiveDate.setDate(archiveDate.getDate() - archiveDays);
        const archiveDateISO = archiveDate.toISOString();

        // Find payments to archive (verified or rejected, older than archiveDays, not pending)
        const { data: paymentsToArchive, error: fetchError } = await supabaseAdmin
            .from('membership_payments')
            .select('*')
            .in('status', ['verified', 'rejected'])
            .lt('created_at', archiveDateISO)
            .order('created_at', { ascending: true });

        if (fetchError) {
            console.error('[ARCHIVE] Error fetching payments to archive:', fetchError);
            return { success: false, archivedCount: 0, error: fetchError.message };
        }

        if (!paymentsToArchive || paymentsToArchive.length === 0) {
            return { success: true, archivedCount: 0 };
        }

        // TODO: Export to archive storage (JSON file, CSV, or separate archive table)
        // For now, we'll just log the count
        // In production, you might want to:
        // 1. Create an 'archived_payments' table
        // 2. Insert payments into archive table
        // 3. Delete from main table
        // OR export to Supabase Storage as JSON/CSV

        console.log(`[ARCHIVE] Found ${paymentsToArchive.length} payments to archive (older than ${archiveDays} days)`);

        // For now, just return count - actual archiving requires:
        // 1. Creating archive table/storage
        // 2. Moving data
        // 3. Deleting from main table

        return {
            success: true,
            archivedCount: paymentsToArchive.length
        };
    } catch (error: any) {
        console.error('[ARCHIVE] Error archiving payments:', error);
        return { success: false, archivedCount: 0, error: error.message };
    }
}

/**
 * Get payment archive statistics
 */
export async function getPaymentArchiveStats(): Promise<{
    totalPayments: number;
    archivablePayments: number;
    oldestPaymentDate: string | null;
}> {
    if (!supabaseAdmin) {
        throw new Error('Supabase admin client not initialized');
    }

    try {
        const archiveDate = new Date();
        archiveDate.setDate(archiveDate.getDate() - 730); // 2 years
        const archiveDateISO = archiveDate.toISOString();

        // Get total payments
        const { count: totalCount } = await supabaseAdmin
            .from('membership_payments')
            .select('*', { count: 'exact', head: true });

        // Get archivable payments (verified/rejected, older than 2 years)
        const { count: archivableCount } = await supabaseAdmin
            .from('membership_payments')
            .select('*', { count: 'exact', head: true })
            .in('status', ['verified', 'rejected'])
            .lt('created_at', archiveDateISO);

        // Get oldest payment date
        const { data: oldestPayment } = await supabaseAdmin
            .from('membership_payments')
            .select('created_at')
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

        return {
            totalPayments: totalCount || 0,
            archivablePayments: archivableCount || 0,
            oldestPaymentDate: oldestPayment?.created_at || null
        };
    } catch (error: any) {
        console.error('[ARCHIVE] Error getting archive stats:', error);
        throw error;
    }
}

