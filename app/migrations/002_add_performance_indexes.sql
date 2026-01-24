-- Performance indexes for NAS/low-resource deployments
-- These indexes optimize the most common scraper queries

-- Index for history cache queries (vendor + date range, ordered by date)
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_date
ON transactions(vendor, date DESC);

-- Index for category cache queries (category lookups with date filter)
CREATE INDEX IF NOT EXISTS idx_transactions_category_date
ON transactions(date DESC)
WHERE category IS NOT NULL AND category != '' AND category != 'N/A';

-- Index for scrape event status checks (concurrency detection)
CREATE INDEX IF NOT EXISTS idx_scrape_events_status_created
ON scrape_events(status, created_at DESC)
WHERE status = 'started';

-- Index for active credentials sync ordering
CREATE INDEX IF NOT EXISTS idx_vendor_credentials_active_synced
ON vendor_credentials(is_active, last_synced_at)
WHERE is_active = true;

-- Index for transaction deduplication (business key lookup)
CREATE INDEX IF NOT EXISTS idx_transactions_dedup
ON transactions(vendor, date, account_number);

-- Index for recurring payments detection
CREATE INDEX IF NOT EXISTS idx_transactions_recurring
ON transactions(name, vendor)
WHERE price < 0;
