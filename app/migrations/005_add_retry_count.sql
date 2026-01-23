-- Add retry_count column to scrape_events table
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'scrape_events' AND column_name = 'retry_count') THEN
    ALTER TABLE scrape_events ADD COLUMN retry_count INTEGER DEFAULT 0;
  END IF;
END $$;
