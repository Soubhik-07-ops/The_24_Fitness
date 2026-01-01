-- Create invoices table for storing all generated invoices
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    payment_id INTEGER REFERENCES membership_payments(id) ON DELETE SET NULL,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_type VARCHAR(50) NOT NULL, -- 'membership', 'trainer_addon', 'membership_renewal', 'trainer_renewal'
    amount DECIMAL(10, 2) NOT NULL,
    plan_name VARCHAR(100),
    plan_type VARCHAR(50),
    plan_mode VARCHAR(50), -- 'online' or 'in_gym'
    duration_months INTEGER,
    trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL,
    trainer_name VARCHAR(255),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_name VARCHAR(255),
    user_email VARCHAR(255),
    pdf_url TEXT, -- URL to the stored PDF invoice
    pdf_path TEXT, -- Path in Supabase Storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoices_membership_id ON invoices(membership_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);

-- Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own invoices
CREATE POLICY "Users can view their own invoices"
    ON invoices FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Admins can view all invoices
-- Note: Admin system uses service role key which bypasses RLS, so this policy is mainly for reference
-- In practice, admin API routes use service role and can access all invoices
CREATE POLICY "Admins can view all invoices"
    ON invoices FOR SELECT
    USING (false); -- Service role bypasses RLS, so this is always false for regular users

-- Policy: Only service role can insert/update invoices (via API)
CREATE POLICY "Service role can manage invoices"
    ON invoices FOR ALL
    USING (false)
    WITH CHECK (false);

-- Add comment
COMMENT ON TABLE invoices IS 'Stores all generated invoices for memberships, trainer addons, and renewals';

