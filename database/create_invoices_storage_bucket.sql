-- Create invoices storage bucket in Supabase Storage
-- Run this in Supabase SQL Editor or via Supabase Dashboard

-- Note: Storage buckets must be created via Supabase Dashboard or Storage API
-- This SQL script is for reference only

-- To create the bucket:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New bucket"
-- 3. Name: "invoices"
-- 4. Public: false (private bucket)
-- 5. File size limit: 10 MB (or as needed)
-- 6. Allowed MIME types: application/pdf

-- OR use the Storage API:
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--     'invoices',
--     'invoices',
--     false,
--     10485760, -- 10 MB in bytes
--     ARRAY['application/pdf']
-- );

-- Storage policies (RLS for storage)
-- Allow authenticated users to read their own invoices
CREATE POLICY "Users can view their own invoice files"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'invoices' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow service role to manage all invoice files
-- Note: Service role bypasses RLS, so this is mainly for reference
CREATE POLICY "Service role can manage invoice files"
ON storage.objects FOR ALL
USING (bucket_id = 'invoices')
WITH CHECK (bucket_id = 'invoices');

