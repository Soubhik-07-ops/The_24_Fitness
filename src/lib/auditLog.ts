/**
 * Audit logging utilities for tracking membership operations
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

export interface AuditLogEntry {
    membership_id: number;
    action: 'approved' | 'rejected' | 'payment_verified' | 'trainer_assigned' | 'status_changed' | 'trainer_renewal_approved' | 'trainer_renewal_rejected' | 'trainer_grace_period_started' | 'trainer_grace_period_expired';
    admin_id?: string | null;
    admin_email?: string | null;
    details?: string;
    previous_status?: string;
    new_status?: string;
    metadata?: Record<string, any>;
}

/**
 * Log an audit event for membership operations
 * Note: This logs to console for now. In production, you might want to store in a database table
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
    const timestamp = new Date().toISOString();
    const logMessage = {
        timestamp,
        ...entry
    };

    // Log to console (can be enhanced to store in database)
    console.log('[AUDIT LOG]', JSON.stringify(logMessage, null, 2));

    // TODO: Store in audit_logs table if you create one
    // await supabaseAdmin
    //     .from('audit_logs')
    //     .insert({
    //         membership_id: entry.membership_id,
    //         action: entry.action,
    //         admin_id: entry.admin_id,
    //         admin_email: entry.admin_email,
    //         details: entry.details,
    //         previous_status: entry.previous_status,
    //         new_status: entry.new_status,
    //         metadata: entry.metadata,
    //         created_at: timestamp
    //     });
}

