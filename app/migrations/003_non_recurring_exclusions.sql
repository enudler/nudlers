-- Non-Recurring Exclusions Table
-- Stores transactions that users have explicitly marked as NOT recurring
-- These will be excluded from the recurring payments detection

CREATE TABLE IF NOT EXISTS non_recurring_exclusions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  account_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, COALESCE(account_number, ''))
);

CREATE INDEX IF NOT EXISTS idx_non_recurring_exclusions_name ON non_recurring_exclusions(name);
CREATE INDEX IF NOT EXISTS idx_non_recurring_exclusions_lookup ON non_recurring_exclusions(LOWER(TRIM(name)), account_number);
