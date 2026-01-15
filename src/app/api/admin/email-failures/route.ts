/**
 * Admin API Route: Email Failures Management
 * 
 * Allows admins to view, filter, and resolve email delivery failures
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSession } from '@/lib/adminAuth';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function GET(request: NextRequest) {
    try {
        // Verify admin authentication
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json(
                { error: 'Not authenticated' },
                { status: 401 }
            );
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json(
                { error: 'Invalid or expired admin session' },
                { status: 401 }
            );
        }

        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const filter = searchParams.get('filter') || 'unresolved'; // 'all', 'unresolved', 'resolved'
        const limit = parseInt(searchParams.get('limit') || '100', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        // Build query
        // Note: email_failures.user_id references auth.users, not profiles directly
        // So we need to fetch profiles separately or use a different approach
        let query = supabaseAdmin
            .from('email_failures')
            .select(`
                *,
                memberships!email_failures_membership_id_fkey(id, plan_name, status)
            `)
            .order('last_attempt_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Apply filter
        if (filter === 'unresolved') {
            query = query.is('resolved_at', null);
        } else if (filter === 'resolved') {
            query = query.not('resolved_at', 'is', null);
        }
        // 'all' doesn't need additional filter

        const { data: failures, error } = await query;

        if (error) {
            console.error('[EMAIL FAILURES API] Error fetching failures:', error);
            return NextResponse.json(
                { error: 'Failed to fetch email failures' },
                { status: 500 }
            );
        }

        // Fetch user profiles separately (since user_id references auth.users, not profiles directly)
        const userIds = [...new Set((failures || []).map((f: any) => f.user_id))];
        const profilesMap = new Map<string, { full_name: string }>();
        
        if (userIds.length > 0) {
            const { data: profiles, error: profilesError } = await supabaseAdmin
                .from('profiles')
                .select('id, full_name')
                .in('id', userIds);

            if (!profilesError && profiles) {
                profiles.forEach(profile => {
                    profilesMap.set(profile.id, { full_name: profile.full_name });
                });
            }
        }

        // Attach profile data to failures
        const failuresWithProfiles = (failures || []).map((failure: any) => ({
            ...failure,
            profiles: profilesMap.get(failure.user_id) || null
        }));

        // Get counts for summary
        const { count: unresolvedCount } = await supabaseAdmin
            .from('email_failures')
            .select('*', { count: 'exact', head: true })
            .is('resolved_at', null);

        const { count: resolvedCount } = await supabaseAdmin
            .from('email_failures')
            .select('*', { count: 'exact', head: true })
            .not('resolved_at', 'is', null);

        return NextResponse.json({
            success: true,
            failures: failuresWithProfiles,
            summary: {
                unresolved: unresolvedCount || 0,
                resolved: resolvedCount || 0,
                total: (unresolvedCount || 0) + (resolvedCount || 0)
            }
        });
    } catch (error: any) {
        console.error('[EMAIL FAILURES API] Exception:', error);
        return NextResponse.json(
            { error: 'Failed to process request' },
            { status: 500 }
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        // Verify admin authentication
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json(
                { error: 'Not authenticated' },
                { status: 401 }
            );
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json(
                { error: 'Invalid or expired admin session' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { failureId, action } = body;

        if (!failureId || !action) {
            return NextResponse.json(
                { error: 'failureId and action are required' },
                { status: 400 }
            );
        }

        if (action === 'resolve') {
            // Mark failure as resolved
            const { error } = await supabaseAdmin
                .from('email_failures')
                .update({ resolved_at: new Date().toISOString() })
                .eq('id', failureId)
                .is('resolved_at', null); // Only update if not already resolved

            if (error) {
                console.error('[EMAIL FAILURES API] Error resolving failure:', error);
                return NextResponse.json(
                    { error: 'Failed to resolve email failure' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                message: 'Email failure marked as resolved'
            });
        } else if (action === 'unresolve') {
            // Mark failure as unresolved (for re-investigation)
            const { error } = await supabaseAdmin
                .from('email_failures')
                .update({ resolved_at: null })
                .eq('id', failureId);

            if (error) {
                console.error('[EMAIL FAILURES API] Error unresolving failure:', error);
                return NextResponse.json(
                    { error: 'Failed to unresolve email failure' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                message: 'Email failure marked as unresolved'
            });
        } else {
            return NextResponse.json(
                { error: 'Invalid action. Use "resolve" or "unresolve"' },
                { status: 400 }
            );
        }
    } catch (error: any) {
        console.error('[EMAIL FAILURES API] Exception:', error);
        return NextResponse.json(
            { error: 'Failed to process request' },
            { status: 500 }
        );
    }
}

