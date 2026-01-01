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
        if (!token) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });

        const body = await request.json();

        // Basic input sanitization / allowed fields
        const allowed = ['name', 'description', 'schedule', 'duration_minutes', 'max_capacity', 'category', 'image_url'];
        const payload: any = {};
        for (const key of allowed) {
            if (body[key] !== undefined) payload[key] = body[key];
        }

        // Required checks
        if (!payload.name || !payload.schedule) {
            return NextResponse.json({ success: false, error: 'Missing required fields: name and schedule' }, { status: 400 });
        }

        // Coerce numeric fields and set sensible defaults
        payload.duration_minutes = parseInt(payload.duration_minutes) || 60;
        payload.max_capacity = parseInt(payload.max_capacity) || 20;
        payload.category = payload.category || 'General';

        const { data, error } = await supabaseAdmin.from('classes').insert([payload]).select();

        if (error) {
            console.error('Admin classes POST error:', error);
            return NextResponse.json({ success: false, error: error.message || error }, { status: 500 });
        }

        // Audit log (best-effort)
        try {
            await supabaseAdmin.from('admin_audit').insert([{ admin_id: admin.id, action: 'create', table_name: 'classes', record_id: data?.[0]?.id || null, payload: JSON.stringify(payload), created_at: new Date().toISOString() }]);
        } catch (auditErr) {
            console.warn('Failed to write audit log:', auditErr);
        }

        return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (err: any) {
        console.error('Admin classes POST exception:', err);
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });

        const body = await request.json();
        const { id, ...rest } = body;

        if (!id) return NextResponse.json({ success: false, error: 'Missing id for update' }, { status: 400 });

        // Get current class data to check for old image
        const { data: currentClass } = await supabaseAdmin
            .from('classes')
            .select('image_url')
            .eq('id', id)
            .single();

        // Only allow whitelisted fields
        const allowed = ['name', 'description', 'schedule', 'duration_minutes', 'max_capacity', 'category', 'image_url'];
        const updatePayload: any = {};
        for (const key of allowed) {
            if (rest[key] !== undefined) updatePayload[key] = rest[key];
        }

        if (updatePayload.duration_minutes !== undefined) updatePayload.duration_minutes = parseInt(updatePayload.duration_minutes) || 60;
        if (updatePayload.max_capacity !== undefined) updatePayload.max_capacity = parseInt(updatePayload.max_capacity) || 20;

        // Delete old image from storage if image_url is being removed or changed
        if (currentClass?.image_url) {
            const newImageUrl = updatePayload.image_url;
            // If image_url is null/empty or different from current, delete old image
            if (!newImageUrl || newImageUrl !== currentClass.image_url) {
                try {
                    const urlParts = currentClass.image_url.split('/');
                    const pathIndex = urlParts.findIndex((part: string) => part === 'class-images');
                    if (pathIndex !== -1 && pathIndex < urlParts.length - 1) {
                        const imagePath = urlParts.slice(pathIndex + 1).join('/');
                        await supabaseAdmin.storage
                            .from('class-images')
                            .remove([imagePath]);
                    }
                } catch (imgErr) {
                    console.warn('Error deleting old image during update:', imgErr);
                    // Continue with update even if image deletion fails
                }
            }
        }

        const { data, error } = await supabaseAdmin.from('classes').update(updatePayload).eq('id', id).select();

        if (error) {
            console.error('Admin classes PUT error:', error);
            return NextResponse.json({ success: false, error: error.message || error }, { status: 500 });
        }

        // Audit
        try {
            await supabaseAdmin.from('admin_audit').insert([{ admin_id: admin.id, action: 'update', table_name: 'classes', record_id: id, payload: JSON.stringify(updatePayload), created_at: new Date().toISOString() }]);
        } catch (auditErr) {
            console.warn('Failed to write audit log:', auditErr);
        }

        return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (err: any) {
        console.error('Admin classes PUT exception:', err);
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

        const admin = await validateAdminSession(token);
        if (!admin) return NextResponse.json({ success: false, error: 'Invalid or expired admin session' }, { status: 401 });

        const body = await request.json();
        const { id } = body;

        if (!id) return NextResponse.json({ success: false, error: 'Missing id for delete' }, { status: 400 });

        // Get class data including image_url before deleting
        const { data: classData, error: classFetchError } = await supabaseAdmin
            .from('classes')
            .select('name, image_url')
            .eq('id', id)
            .single();

        if (classFetchError || !classData) {
            console.error('Error fetching class:', classFetchError);
            return NextResponse.json({ success: false, error: 'Class not found' }, { status: 404 });
        }

        const className = classData.name || 'the class';

        // Delete image from storage if it exists
        if (classData.image_url) {
            try {
                // Extract path from URL (e.g., "classes/1234567890_abc123.jpg")
                const urlParts = classData.image_url.split('/');
                const pathIndex = urlParts.findIndex((part: string) => part === 'class-images');
                if (pathIndex !== -1 && pathIndex < urlParts.length - 1) {
                    const imagePath = urlParts.slice(pathIndex + 1).join('/');
                    const { error: deleteImageError } = await supabaseAdmin.storage
                        .from('class-images')
                        .remove([imagePath]);

                    if (deleteImageError) {
                        console.warn('Error deleting class image from storage:', deleteImageError);
                        // Continue with class deletion even if image deletion fails
                    }
                }
            } catch (imgErr) {
                console.warn('Error processing image deletion:', imgErr);
                // Continue with class deletion even if image deletion fails
            }
        }

        // Booking system removed - just clean up reviews
        const { error: reviewsError } = await supabaseAdmin.from('reviews').delete().eq('class_id', id);
        if (reviewsError) {
            console.error('Error deleting reviews for class:', reviewsError);
            // Continue anyway - might be cascade delete
        }

        const { error } = await supabaseAdmin.from('classes').delete().eq('id', id);

        if (error) {
            console.error('Admin classes DELETE error:', error);
            return NextResponse.json({ success: false, error: error.message || error }, { status: 500 });
        }

        // Booking system removed - no notifications needed

        // Audit
        try {
            await supabaseAdmin.from('admin_audit').insert([{ admin_id: admin.id, action: 'delete', table_name: 'classes', record_id: id, payload: null, created_at: new Date().toISOString() }]);
        } catch (auditErr) {
            console.warn('Failed to write audit log:', auditErr);
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
        console.error('Admin classes DELETE exception:', err);
        return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
}
