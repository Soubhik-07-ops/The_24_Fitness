import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

/**
 * Extract file path from Supabase Storage URL
 */
function extractStoragePath(url: string, bucketName: string): string | null {
    try {
        const urlParts = url.split('/');
        const bucketIndex = urlParts.findIndex(part => part === bucketName);
        if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
            return urlParts.slice(bucketIndex + 1).join('/');
        }
        // Handle direct paths (without full URL)
        if (url.includes(bucketName)) {
            const parts = url.split(bucketName + '/');
            return parts.length > 1 ? parts[1] : null;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Delete all storage files associated with a user
 */
async function deleteUserStorageFiles(userId: string): Promise<void> {
    const buckets = ['avatars', 'payment-screenshots', 'weekly-charts', 'invoices'];
    const filesToDelete: { bucket: string; path: string }[] = [];

    // Collect all files to delete
    for (const bucket of buckets) {
        try {
            // List all files in user's folder (if organized by user_id)
            const { data: files, error } = await supabaseAdmin.storage
                .from(bucket)
                .list(userId, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

            if (!error && files) {
                files.forEach(file => {
                    filesToDelete.push({ bucket, path: `${userId}/${file.name}` });
                });
            }
        } catch (err) {
            logger.warn(`Error listing files in ${bucket}:`, err);
        }
    }

    // Delete collected files
    for (const { bucket, path } of filesToDelete) {
        try {
            await supabaseAdmin.storage.from(bucket).remove([path]);
        } catch (err) {
            logger.warn(`Error deleting file from ${bucket}:`, err);
        }
    }
}

/**
 * Delete all storage files from database references (payment screenshots, chart files, invoice files)
 */
async function deleteReferencedStorageFiles(userId: string): Promise<void> {
    try {
        // Get all memberships for this user
        const { data: memberships } = await supabaseAdmin
            .from('memberships')
            .select('id')
            .eq('user_id', userId);

        if (!memberships || memberships.length === 0) return;

        const membershipIds = memberships.map(m => m.id);

        // Delete payment screenshots
        const { data: payments } = await supabaseAdmin
            .from('membership_payments')
            .select('payment_screenshot_url')
            .in('membership_id', membershipIds)
            .not('payment_screenshot_url', 'is', null);

        if (payments) {
            for (const payment of payments) {
                if (payment.payment_screenshot_url) {
                    const path = extractStoragePath(payment.payment_screenshot_url, 'payment-screenshots');
                    if (path) {
                        try {
                            await supabaseAdmin.storage.from('payment-screenshots').remove([path]);
                        } catch (err) {
                            logger.warn('Error deleting payment screenshot:', err);
                        }
                    }
                }
            }
        }

        // Delete weekly chart files
        const { data: charts } = await supabaseAdmin
            .from('weekly_charts')
            .select('chart_file_url')
            .in('membership_id', membershipIds)
            .not('chart_file_url', 'is', null);

        if (charts) {
            for (const chart of charts) {
                if (chart.chart_file_url) {
                    const path = extractStoragePath(chart.chart_file_url, 'weekly-charts');
                    if (path) {
                        try {
                            await supabaseAdmin.storage.from('weekly-charts').remove([path]);
                        } catch (err) {
                            logger.warn('Error deleting chart file:', err);
                        }
                    }
                }
            }
        }

        // Delete invoice files
        const { data: paymentsForInvoices } = await supabaseAdmin
            .from('membership_payments')
            .select('id')
            .in('membership_id', membershipIds);

        if (paymentsForInvoices && paymentsForInvoices.length > 0) {
            const paymentIds = paymentsForInvoices.map(p => p.id);
            const { data: invoices } = await supabaseAdmin
                .from('invoices')
                .select('invoice_file_url')
                .in('payment_id', paymentIds)
                .not('invoice_file_url', 'is', null);

            if (invoices) {
                for (const invoice of invoices) {
                    if (invoice.invoice_file_url) {
                        const path = extractStoragePath(invoice.invoice_file_url, 'invoices');
                        if (path) {
                            try {
                                await supabaseAdmin.storage.from('invoices').remove([path]);
                            } catch (err) {
                                logger.warn('Error deleting invoice file:', err);
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        logger.error('Error deleting referenced storage files:', err);
        // Don't throw - continue with deletion
    }
}

export async function DELETE(request: NextRequest) {
    let deletionStarted = false;
    let userId: string | null = null;
    let authUserDeleted = false;
    const deletedSteps: string[] = [];

    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });

        const body = await request.json();
        const { id } = body;
        if (!id) return NextResponse.json({ success: false, error: 'Missing id for delete' }, { status: 400 });

        userId = id;

        // Verify user exists in auth
        const { data: { user: authUser }, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(id);
        if (authUserError && authUserError.message !== 'User not found') {
            return NextResponse.json({ success: false, error: `Failed to verify user: ${authUserError.message}` }, { status: 500 });
        }

        if (!authUser) {
            // User doesn't exist in auth, but might have orphaned data - still attempt cleanup
            logger.warn('User not found in auth.users, but proceeding with data cleanup');
        }

        // Get user profile before deleting
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', id)
            .single();

        const userName = profile?.full_name || 'User';
        deletionStarted = true;

        // Step 1: Get all memberships for this user (needed for cascading deletes)
        const { data: memberships, error: membershipsError } = await supabaseAdmin
            .from('memberships')
            .select('id')
            .eq('user_id', id);

        if (membershipsError) {
            throw new Error(`Failed to fetch memberships: ${membershipsError.message}`);
        }

        const membershipIds = memberships?.map(m => m.id) || [];

        // Step 2: Delete invoices (references payments, which reference memberships)
        if (membershipIds.length > 0) {
            const { data: payments } = await supabaseAdmin
                .from('membership_payments')
                .select('id')
                .in('membership_id', membershipIds);

            if (payments && payments.length > 0) {
                const paymentIds = payments.map(p => p.id);
                const { error: invoicesError } = await supabaseAdmin
                    .from('invoices')
                    .delete()
                    .in('payment_id', paymentIds);

                if (invoicesError) {
                    throw new Error(`Failed to delete invoices: ${invoicesError.message}`);
                }
                deletedSteps.push('invoices');
            }
        }

        // Step 3: Delete weekly charts (references memberships)
        if (membershipIds.length > 0) {
            const { error: chartsError } = await supabaseAdmin
                .from('weekly_charts')
                .delete()
                .in('membership_id', membershipIds);

            if (chartsError) {
                throw new Error(`Failed to delete weekly charts: ${chartsError.message}`);
            }
            deletedSteps.push('weekly_charts');
        }

        // Step 4: Delete membership addons (references memberships)
        if (membershipIds.length > 0) {
            const { error: addonsError } = await supabaseAdmin
                .from('membership_addons')
                .delete()
                .in('membership_id', membershipIds);

            if (addonsError) {
                throw new Error(`Failed to delete membership addons: ${addonsError.message}`);
            }
            deletedSteps.push('membership_addons');
        }

        // Step 5: Delete membership payments (references memberships)
        if (membershipIds.length > 0) {
            const { error: paymentsError } = await supabaseAdmin
                .from('membership_payments')
                .delete()
                .in('membership_id', membershipIds);

            if (paymentsError) {
                throw new Error(`Failed to delete membership payments: ${paymentsError.message}`);
            }
            deletedSteps.push('membership_payments');
        }

        // Step 6: Delete memberships (references user_id)
        const { error: membershipsDeleteError } = await supabaseAdmin
            .from('memberships')
            .delete()
            .eq('user_id', id);

        if (membershipsDeleteError) {
            throw new Error(`Failed to delete memberships: ${membershipsDeleteError.message}`);
        }
        deletedSteps.push('memberships');

        // Step 7: Delete contact messages (references contact_requests, which reference user_id)
        try {
            // Get contact requests for this user
            const { data: contactRequests } = await supabaseAdmin
                .from('contact_requests')
                .select('id')
                .eq('user_id', id);

            if (contactRequests && contactRequests.length > 0) {
                const requestIds = contactRequests.map(r => r.id);
                // Delete contact messages
                const { error: contactMessagesError } = await supabaseAdmin
                    .from('contact_messages')
                    .delete()
                    .in('request_id', requestIds);

                if (contactMessagesError) {
                    logger.warn('Warning: Failed to delete contact messages:', contactMessagesError);
                } else {
                    deletedSteps.push('contact_messages');
                }

                // Delete contact notifications
                try {
                    await supabaseAdmin
                        .from('contact_notifications')
                        .delete()
                        .in('request_id', requestIds);
                    deletedSteps.push('contact_notifications');
                } catch (err) {
                    // Table might not exist, ignore
                }

                // Delete contact requests
                const { error: contactRequestsError } = await supabaseAdmin
                    .from('contact_requests')
                    .delete()
                    .eq('user_id', id);

                if (contactRequestsError) {
                    throw new Error(`Failed to delete contact requests: ${contactRequestsError.message}`);
                }
                deletedSteps.push('contact_requests');
            }
        } catch (err: any) {
            // If contact tables don't exist or have errors, log but don't fail
            logger.warn('Warning during contact data deletion:', err);
        }

        // Step 8: Delete notifications (references user_id)
        const { error: notificationsError } = await supabaseAdmin
            .from('notifications')
            .delete()
            .eq('recipient_id', id);

        if (notificationsError) {
            throw new Error(`Failed to delete notifications: ${notificationsError.message}`);
        }
        deletedSteps.push('notifications');

        // Step 9: Delete reviews (references user_id)
        const { error: reviewsError } = await supabaseAdmin
            .from('reviews')
            .delete()
            .eq('user_id', id);

        if (reviewsError) {
            throw new Error(`Failed to delete reviews: ${reviewsError.message}`);
        }
        deletedSteps.push('reviews');

        // Step 10: Delete trainer messages (references user_id)
        const { error: messagesError } = await supabaseAdmin
            .from('trainer_messages')
            .delete()
            .eq('user_id', id);

        if (messagesError) {
            throw new Error(`Failed to delete trainer messages: ${messagesError.message}`);
        }
        deletedSteps.push('trainer_messages');

        // Step 11: Delete email failures/events if they exist (references user_id)
        try {
            const { error: emailFailuresError } = await supabaseAdmin.from('email_failures').delete().eq('user_id', id);
            if (!emailFailuresError) {
                deletedSteps.push('email_failures');
            }
        } catch (err) {
            // Table might not exist, ignore
        }

        try {
            const { error: emailEventsError } = await supabaseAdmin.from('email_events').delete().eq('user_id', id);
            if (!emailEventsError) {
                deletedSteps.push('email_events');
            }
        } catch (err) {
            // Table might not exist, ignore
        }

        // Step 12: Delete storage files (before deleting profile which might have avatar_url reference)
        try {
            await deleteUserStorageFiles(id);
            await deleteReferencedStorageFiles(id);
            deletedSteps.push('storage_files');

            // Delete avatar if exists
            if (profile?.avatar_url) {
                const avatarPath = extractStoragePath(profile.avatar_url, 'avatars');
                if (avatarPath) {
                    try {
                        await supabaseAdmin.storage.from('avatars').remove([avatarPath]);
                    } catch (err) {
                        logger.warn('Error deleting avatar:', err);
                    }
                }
            }
        } catch (err) {
            logger.warn('Warning: Error deleting storage files:', err);
            // Don't fail deletion if storage deletion fails
        }

        // Step 13: Delete profile (references auth.users)
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('id', id);

        if (profileError) {
            throw new Error(`Failed to delete profile: ${profileError.message}`);
        }
        deletedSteps.push('profile');

        // Step 14: Sign out all sessions for the user before deletion
        // This ensures the user is immediately logged out on all devices
        if (authUser) {
            try {
                // Get all sessions for this user and sign them out
                // Note: Supabase Admin API doesn't have a direct "sign out all sessions" method,
                // but deleting the user will invalidate all sessions. However, we can try to
                // manually invalidate by updating the user's metadata or using signOut
                // For now, we'll rely on the deleteUser to invalidate sessions, but we'll
                // add additional validation in API routes to check user existence
                
                // Attempt to sign out using admin API (if available in your Supabase version)
                // Some versions support: await supabaseAdmin.auth.admin.signOut(id, { scope: 'global' });
                // If not available, the deleteUser call below will handle session invalidation
            } catch (signOutErr) {
                logger.warn('Warning: Could not explicitly sign out user sessions:', signOutErr);
                // Continue with deletion - deleteUser will invalidate sessions
            }
        }

        // Step 15: Delete Supabase Auth user (CRITICAL - must succeed or we have orphaned data)
        // This MUST happen after all data is deleted to avoid foreign key constraint issues
        // Deleting the user will automatically invalidate all their sessions
        if (authUser) {
            const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
            if (authDeleteError) {
                // This is critical - if auth deletion fails, we've already deleted all data
                // Log as critical error and throw
                logger.error(`CRITICAL: Failed to delete auth user after data deletion. Data already deleted: ${deletedSteps.join(', ')}`);
                throw new Error(`CRITICAL: Failed to delete auth user: ${authDeleteError.message}. Data was already deleted and may be orphaned.`);
            }
            authUserDeleted = true;
            deletedSteps.push('auth_user');
            deletedSteps.push('sessions_invalidated');
        } else {
            // No auth user to delete, but mark as complete
            authUserDeleted = true;
            logger.warn('No auth user found, skipping auth deletion');
        }

        // Step 15: Audit log (only if deletion was successful)
        if (authUserDeleted) {
            try {
                await supabaseAdmin.from('admin_audit').insert([{
                    admin_id: admin.id,
                    action: 'delete',
                    table_name: 'profiles',
                    record_id: id,
                    payload: {
                        user_name: userName,
                        deleted_steps: deletedSteps
                    },
                    created_at: new Date().toISOString()
                }]);
            } catch (auditErr) {
                logger.warn('Failed to write audit log (users):', auditErr);
                // Don't fail deletion if audit fails
            }
        }

        return NextResponse.json({
            success: true,
            message: `User ${userName} deleted successfully`,
            deletedSteps
        }, { status: 200 });
    } catch (err: any) {
        logger.error('Admin users DELETE exception:', err);
        const errorMessage = err.message || String(err);

        // If deletion started but auth user was not deleted, this is critical
        if (deletionStarted && !authUserDeleted && userId) {
            logger.error('CRITICAL: Partial deletion occurred.');
            logger.error(`Deleted steps: ${deletedSteps.join(', ')}`);
            logger.error('Auth user deletion failed - orphaned data may exist.');
            logger.error('Manual cleanup required.');
        } else if (deletionStarted && userId) {
            logger.error(`Partial deletion occurred. Deleted: ${deletedSteps.join(', ')}`);
        }

        return NextResponse.json({
            success: false,
            error: errorMessage,
            partialDeletion: deletionStarted && !authUserDeleted,
            deletedSteps: deletionStarted ? deletedSteps : []
        }, { status: 500 });
    }
}
