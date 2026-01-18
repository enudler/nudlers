-- Add duration column to scrape_events
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scrape_events' AND column_name = 'duration_seconds') THEN
    ALTER TABLE scrape_events ADD COLUMN duration_seconds INTEGER;
  END IF;
END $$;
