-- Migration 004: Add contact details and status columns
-- Fixes #15: Ensure company and status fields exist

DO $$
BEGIN
    -- Add company column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contacts' AND column_name = 'company'
    ) THEN
        ALTER TABLE contacts ADD COLUMN company VARCHAR(150);
    END IF;

    -- Add status column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contacts' AND column_name = 'status'
    ) THEN
        ALTER TABLE contacts ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'new';
    END IF;

    -- Add updated_at column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contacts' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE contacts ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;

    -- Add first_name / last_name if you want to split name (optional)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contacts' AND column_name = 'first_name'
    ) THEN
        ALTER TABLE contacts ADD COLUMN first_name VARCHAR(100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contacts' AND column_name = 'last_name'
    ) THEN
        ALTER TABLE contacts ADD COLUMN last_name VARCHAR(100);
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company);
