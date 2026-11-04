// src/app/api/admin/attendance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession, getAdminTokenFromRequest } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function GET(request: NextRequest) {
    try {
        const token = getAdminTokenFromRequest(request);
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const queryDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

        const { data: attendance, error } = await supabaseAdmin
            .from('attendance_records')
            .select(`
                id,
                user_id,
                member_code,
                date,
                punch_time,
                shift,
                check_in_type,
                machine_id,
                created_at,
                profiles (
                    id,
                    full_name,
                    phone
                )
            `)
            .eq('date', queryDate)
            .order('punch_time', { ascending: false });

        if (error) {
            console.error('Error fetching attendance records:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const records = (attendance || []).map((row: any) => ({
            id: String(row.id),
            userId: row.user_id,
            userName: row.profiles?.full_name || row.member_code || 'Gym Member',
            userPhone: row.profiles?.phone || '',
            date: row.date,
            checkInTime: row.punch_time,
            session: (row.shift as 'MORNING' | 'EVENING') || 'MORNING',
            planName: 'Floor Access Pass',
            checkInType: row.check_in_type || 'biometric',
            machineId: row.machine_id,
            createdAt: row.created_at,
        }));

        const morningCount = records.filter(r => (r.session || '').toUpperCase() === 'MORNING').length;
        const eveningCount = records.filter(r => (r.session || '').toUpperCase() === 'EVENING').length;

        return NextResponse.json({
            success: true,
            date: queryDate,
            attendance: records,
            stats: {
                total: records.length,
                morning: morningCount,
                evening: eveningCount
            }
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const token = getAdminTokenFromRequest(request);
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const body = await request.json();
        const { userId, memberCode, date, punchTime, shift, checkInType } = body;

        const recordDate = date || new Date().toISOString().split('T')[0];
        const recordPunch = punchTime || new Date().toTimeString().split(' ')[0];
        const recordShift = (shift || 'MORNING').toUpperCase();

        const { data, error } = await supabaseAdmin
            .from('attendance_records')
            .insert({
                user_id: userId,
                member_code: memberCode || 'MANUAL',
                date: recordDate,
                punch_time: recordPunch,
                shift: recordShift,
                check_in_type: checkInType || 'manual',
                machine_id: 'ADMIN-PORTAL'
            })
            .select(`
                id,
                user_id,
                member_code,
                date,
                punch_time,
                shift,
                check_in_type,
                machine_id,
                created_at,
                profiles (
                    id,
                    full_name,
                    phone
                )
            `);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            record: data?.[0]
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}
