-- Add phone_number to vendor_credentials
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_credentials' AND column_name = 'phone_number') THEN
    ALTER TABLE vendor_credentials ADD COLUMN phone_number VARCHAR(100);
  END IF;
END $$;
