-- Create offers table for storing gym offers and promotions
CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    discount_percentage DECIMAL(5, 2),
    -- e.g., 20.00 for 20%
    discount_amount DECIMAL(10, 2),
    -- e.g., 1000.00 for ₹1000 off
    offer_type VARCHAR(50) NOT NULL,
    -- 'percentage', 'amount', 'free_trial', 'other'
    image_url TEXT,
    -- Optional image for the offer
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    -- Higher priority shows first
    applicable_to VARCHAR(50),
    -- 'all', 'new_members', 'existing_members', 'specific_plan'
    plan_name VARCHAR(100),
    -- If applicable_to is 'specific_plan'
    created_by UUID,
    -- Admin who created it (references admins table, but no FK constraint to avoid issues)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_offers_active ON offers(is_active);
CREATE INDEX IF NOT EXISTS idx_offers_dates ON offers(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_offers_priority ON offers(priority DESC);
-- Enable RLS
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
-- Policy: Everyone can view active offers
CREATE POLICY "Anyone can view active offers" ON offers FOR
SELECT USING (
        is_active = true
        AND (
            start_date IS NULL
            OR start_date <= NOW()
        )
        AND (
            end_date IS NULL
            OR end_date >= NOW()
        )
    );
-- Policy: Admins can view all offers (via service role in API)
-- Note: Admin API routes use service role and can access all offers
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_offers_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Trigger to automatically update updated_at
CREATE TRIGGER update_offers_updated_at BEFORE
UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION update_offers_updated_at();