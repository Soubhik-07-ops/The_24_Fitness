import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Public API to fetch general settings (for Footer, Contact page, etc.)
export async function GET(request: NextRequest) {
    try {
        const { data: settings, error } = await supabaseAdmin
            .from('admin_settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['gym_name', 'contact_email', 'contact_phone', 'gym_address', 'business_hours']);

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
        }

        // Convert array to object for easier access
        const settingsMap: Record<string, string> = {};
        settings?.forEach(setting => {
            settingsMap[setting.setting_key] = setting.setting_value || '';
        });

        return NextResponse.json({
            success: true,
            settings: {
                gymName: settingsMap['gym_name'] || 'THE 24 FITNESS GYM',
                contactEmail: settingsMap['contact_email'] || 'The24fitness8055@gmail.com',
                contactPhone: settingsMap['contact_phone'] || '8084548055',
                gymAddress: settingsMap['gym_address'] || 'Digwadih No. 10, near Gobinda sweets, Old SBI Building',
                businessHours: settingsMap['business_hours'] || 'Open 24/6 • 313 Days'
            }
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || 'Failed to fetch settings' },
            { status: 500 }
        );
    }
}

