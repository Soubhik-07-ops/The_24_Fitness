// src/app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// GET - Fetch settings
export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        // Get specific setting key from query params, or fetch all settings
        const { searchParams } = new URL(request.url);
        const settingKey = searchParams.get('key');

        if (settingKey) {
            // Fetch specific setting
            const { data, error } = await supabaseAdmin
                .from('admin_settings')
                .select('setting_key, setting_value, description')
                .eq('setting_key', settingKey)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                throw error;
            }

            return NextResponse.json({
                success: true,
                setting: data || { setting_key: settingKey, setting_value: '', description: '' }
            });
        } else {
            // Fetch all settings
            const { data, error } = await supabaseAdmin
                .from('admin_settings')
                .select('setting_key, setting_value, description')
                .order('setting_key');

            if (error) {
                throw error;
            }

            return NextResponse.json({
                success: true,
                settings: data || []
            });
        }
    } catch (error: any) {
        console.error('Error fetching admin settings:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch settings' },
            { status: 500 }
        );
    }
}

// PUT - Update settings
export async function PUT(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const { setting_key, setting_value } = await request.json();

        if (!setting_key) {
            return NextResponse.json({ error: 'setting_key is required' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('admin_settings')
            .upsert({
                setting_key,
                setting_value: setting_value || ''
            }, {
                onConflict: 'setting_key'
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            setting: data
        });
    } catch (error: any) {
        console.error('Error updating admin settings:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update settings' },
            { status: 500 }
        );
    }
}

