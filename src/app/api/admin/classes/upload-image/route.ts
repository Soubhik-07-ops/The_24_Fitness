import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    // Environment variables will be checked at runtime
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

        // Get form data with file
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const oldImageUrl = formData.get('oldImageUrl') as string | null;

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ success: false, error: 'File must be an image' }, { status: 400 });
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ success: false, error: 'File size must be less than 5MB' }, { status: 400 });
        }

        // Delete old image if provided
        if (oldImageUrl) {
            try {
                // Extract path from URL (e.g., "classes/1234567890_abc123.jpg")
                const urlParts = oldImageUrl.split('/');
                const pathIndex = urlParts.findIndex(part => part === 'class-images');
                if (pathIndex !== -1 && pathIndex < urlParts.length - 1) {
                    const oldPath = urlParts.slice(pathIndex + 1).join('/');
                    await supabaseAdmin.storage.from('class-images').remove([oldPath]);
                }
            } catch (err) {
                // Continue even if deletion fails
            }
        }

        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `classes/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Convert File to ArrayBuffer for upload
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload using service role (bypasses RLS)
        const { error: uploadError } = await supabaseAdmin.storage
            .from('class-images')
            .upload(fileName, buffer, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type
            });

        if (uploadError) {
            return NextResponse.json({ success: false, error: uploadError.message || 'Failed to upload image' }, { status: 500 });
        }

        // Get public URL
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('class-images')
            .getPublicUrl(fileName);

        return NextResponse.json({ success: true, imageUrl: publicUrl }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

