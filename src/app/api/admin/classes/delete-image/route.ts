import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase server env vars for admin image deletion');
}

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function POST(request: NextRequest) {
    try {
        // Authenticate admin session from cookie
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });
        }

        const body = await request.json();
        const { imageUrl } = body;

        if (!imageUrl) {
            return NextResponse.json({ success: false, error: 'Image URL is required' }, { status: 400 });
        }

        // Extract path from URL (e.g., "classes/1234567890_abc123.jpg")
        const urlParts = imageUrl.split('/');
        const pathIndex = urlParts.findIndex(part => part === 'class-images');
        
        if (pathIndex === -1 || pathIndex >= urlParts.length - 1) {
            return NextResponse.json({ success: false, error: 'Invalid image URL format' }, { status: 400 });
        }

        const imagePath = urlParts.slice(pathIndex + 1).join('/');

        // Delete image from storage
        const { error: deleteError } = await supabaseAdmin.storage
            .from('class-images')
            .remove([imagePath]);

        if (deleteError) {
            console.error('Storage delete error:', deleteError);
            return NextResponse.json({ success: false, error: deleteError.message || 'Failed to delete image' }, { status: 500 });
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
        console.error('Admin image delete exception:', err);
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

