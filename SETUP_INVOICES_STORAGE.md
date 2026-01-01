# 📦 Setup Invoices Storage Bucket

## Issue
Invoice generation is failing because the Supabase Storage bucket `invoices` doesn't exist.

## Solution: Create Storage Bucket

### Method 1: Via Supabase Dashboard (Recommended)

1. **Go to Supabase Dashboard**
   - Open your Supabase project
   - Navigate to **Storage** in the left sidebar

2. **Create New Bucket**
   - Click **"New bucket"** button
   - **Bucket name**: `invoices`
   - **Public bucket**: ❌ **Unchecked** (Private bucket)
   - **File size limit**: `10 MB` (or as needed)
   - **Allowed MIME types**: `application/pdf`
   - Click **"Create bucket"**

3. **Set Storage Policies** (Optional - for RLS)
   - Go to **Storage** > **Policies**
   - Create policy for `invoices` bucket:
     - **Policy name**: "Users can view their own invoices"
     - **Allowed operation**: SELECT
     - **Policy definition**:
       ```sql
       (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1])
       ```

### Method 2: Via SQL (Alternative)

Run this in Supabase SQL Editor:

```sql
-- Insert bucket into storage.buckets table
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'invoices',
    'invoices',
    false,  -- Private bucket
    10485760,  -- 10 MB in bytes
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;
```

### Method 3: Via Supabase CLI

```bash
supabase storage create invoices --public false
```

## Verify Bucket Creation

1. Go to **Storage** > **Buckets**
2. You should see `invoices` bucket listed
3. Try generating an invoice again - it should work now

## File Structure

Invoices will be stored as:
```
invoices/
  └── {user_id}/
      └── invoices/
          └── INV-{timestamp}.pdf
```

Example: `invoices/abc123-def456/invoices/INV-20250116123456.pdf`

## Troubleshooting

### Error: "Bucket not found"
- ✅ Make sure bucket name is exactly `invoices` (lowercase)
- ✅ Check that bucket is created in the correct Supabase project
- ✅ Verify you're using the correct Supabase project URL

### Error: "Permission denied"
- ✅ Check storage policies are set correctly
- ✅ Verify service role key has access
- ✅ Check bucket is not public if you want it private

### Error: "File size limit exceeded"
- ✅ Increase file size limit in bucket settings
- ✅ Check PDF generation is not creating oversized files

---

**After creating the bucket, invoice generation should work automatically!** 🎉

