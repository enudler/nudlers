-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
	identifier VARCHAR(50) NOT NULL,
	vendor VARCHAR(50) NOT NULL,
	date DATE NOT NULL,
	name VARCHAR(100) NOT NULL,
	price FLOAT NOT NULL,
	category VARCHAR(50),
	type VARCHAR(20) NOT NULL,
	processed_date DATE,
	original_amount FLOAT,
	original_currency VARCHAR(3),
	charged_currency VARCHAR(3),
	memo TEXT,
	status VARCHAR(20) NOT NULL,
	installments_number INTEGER,
	installments_total INTEGER,
	account_number VARCHAR(50),
	category_source VARCHAR(50),
	rule_matched VARCHAR(255),
	PRIMARY KEY (identifier, vendor)
);

CREATE TABLE IF NOT EXISTS vendor_credentials (
	id SERIAL PRIMARY KEY,
    id_number VARCHAR(100),
	username VARCHAR(100),
	vendor VARCHAR(100) NOT NULL,
    password VARCHAR(100),
    card6_digits VARCHAR(100),
    nickname VARCHAR(100),
	bank_account_number VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_synced_at TIMESTAMP,
	UNIQUE (id_number, username, vendor)
);

-- Migration: Add is_active column to vendor_credentials if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'vendor_credentials' AND column_name = 'is_active') THEN
    ALTER TABLE vendor_credentials ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Migration: Add last_synced_at column to vendor_credentials if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'vendor_credentials' AND column_name = 'last_synced_at') THEN
    ALTER TABLE vendor_credentials ADD COLUMN last_synced_at TIMESTAMP;
  END IF;
END $$;

-- Add categorization rules table
CREATE TABLE IF NOT EXISTS categorization_rules (
    id SERIAL PRIMARY KEY,
    name_pattern VARCHAR(200) NOT NULL,
    target_category VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name_pattern, target_category)
);

-- Add index for better performance when matching rules
CREATE INDEX IF NOT EXISTS idx_categorization_rules_pattern ON categorization_rules(name_pattern);
CREATE INDEX IF NOT EXISTS idx_categorization_rules_active ON categorization_rules(is_active);

-- Audit table to track scrape events
CREATE TABLE IF NOT EXISTS scrape_events (
    id SERIAL PRIMARY KEY,
    triggered_by VARCHAR(100),
    vendor VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'started',
    message TEXT,
    report_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scrape_events_created_at ON scrape_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_events_vendor ON scrape_events(vendor);

-- Migration: Add account_number column to transactions table if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'transactions' AND column_name = 'account_number') THEN
    ALTER TABLE transactions ADD COLUMN account_number VARCHAR(50);
  END IF;
END $$;

-- Card ownership table: tracks which credential "owns" each card for a given vendor
-- First credential to scrape a card claims ownership; other credentials skip that card
CREATE TABLE IF NOT EXISTS card_ownership (
    id SERIAL PRIMARY KEY,
    vendor VARCHAR(50) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    credential_id INTEGER NOT NULL REFERENCES vendor_credentials(id) ON DELETE CASCADE,
    linked_bank_account_id INTEGER REFERENCES vendor_credentials(id) ON DELETE SET NULL,
    custom_bank_account_number VARCHAR(100),
    custom_bank_account_nickname VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(vendor, account_number)
);

CREATE INDEX IF NOT EXISTS idx_card_ownership_vendor ON card_ownership(vendor);
CREATE INDEX IF NOT EXISTS idx_card_ownership_credential ON card_ownership(credential_id);
CREATE INDEX IF NOT EXISTS idx_card_ownership_bank_account ON card_ownership(linked_bank_account_id);

-- Budget table to store general category spending limits (applies to any month)
CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL UNIQUE, -- One budget per category (general, not month-specific)
    budget_limit FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for better performance when querying budgets by category
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);

-- Migration: Convert from month-specific to general budgets
-- Keep the highest budget_limit per category if there are multiple months
DO $$ 
BEGIN 
  -- Check if cycle column exists (old schema)
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'budgets' AND column_name = 'cycle') THEN
    -- Create temp table with max budget per category
    CREATE TEMP TABLE temp_budgets AS
    SELECT category, MAX(budget_limit) as budget_limit
    FROM budgets
    GROUP BY category;
    
    -- Drop old table and recreate
    DROP TABLE budgets;
    
    CREATE TABLE budgets (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL UNIQUE,
        budget_limit FLOAT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Restore data
    INSERT INTO budgets (category, budget_limit)
    SELECT category, budget_limit FROM temp_budgets;
    
    DROP TABLE temp_budgets;
  END IF;
END $$;

-- Card vendors table to store card issuer/brand for each card (by last 4 digits)
CREATE TABLE IF NOT EXISTS card_vendors (
    id SERIAL PRIMARY KEY,
    last4_digits VARCHAR(4) NOT NULL UNIQUE,
    card_vendor VARCHAR(50) NOT NULL,
    card_nickname VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for quick lookup by last 4 digits
CREATE INDEX IF NOT EXISTS idx_card_vendors_last4 ON card_vendors(last4_digits);

-- Duplicate prevention: Create a unique index on business fields as a secondary defense
-- This catches duplicates that might slip through due to identifier changes
-- Using a partial index to exclude manual transactions (which have unique timestamps in identifiers)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_business_key 
ON transactions (vendor, date, LOWER(TRIM(name)), ABS(price), COALESCE(account_number, ''))
WHERE vendor NOT LIKE 'manual_%';

-- Total spend budget table - stores a single overall spending limit across all credit cards
CREATE TABLE IF NOT EXISTS total_budget (
    id SERIAL PRIMARY KEY,
    budget_limit FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure only one row exists in total_budget
CREATE UNIQUE INDEX IF NOT EXISTS idx_total_budget_single_row ON total_budget ((true));

-- App settings table - stores application configuration as key-value pairs
CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for quick key lookup
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- Transaction categories table: stores description -> category mappings for faster lookups
CREATE TABLE IF NOT EXISTS transaction_categories (
    id SERIAL PRIMARY KEY,
    description VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(description)
);

CREATE INDEX IF NOT EXISTS idx_transaction_categories_description ON transaction_categories(description);
CREATE INDEX IF NOT EXISTS idx_transaction_categories_category ON transaction_categories(category);

-- Category mappings table
CREATE TABLE IF NOT EXISTS category_mappings (
    id SERIAL PRIMARY KEY,
    source_category VARCHAR(50) NOT NULL,
    target_category VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_category)
);
CREATE INDEX IF NOT EXISTS idx_category_mappings_source ON category_mappings(source_category);

-- Chat tables
CREATE TABLE IF NOT EXISTS chat_sessions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- Insert default settings
INSERT INTO app_settings (key, value, description) VALUES
    ('sync_enabled', 'false', 'Enable automatic background sync'),
    ('sync_interval_hours', '24', 'Hours between automatic syncs'),
    ('sync_days_back', '30', 'Number of days to sync back for each account'),
    ('default_currency', '"ILS"', 'Default currency for transactions'),
    ('date_format', '"DD/MM/YYYY"', 'Date display format'),
    ('billing_cycle_start_day', '10', 'Day of month when billing cycle starts'),
    ('show_browser', 'false', 'Show browser window during scraping (for debugging/2FA)'),
    ('fetch_categories_from_scrapers', 'true', 'Fetch categories from card providers during scraping. Disable to reduce rate limiting on Isracard/Amex/Cal.'),
    ('update_category_on_rescrape', 'false', 'Update transaction categories if bank provides new ones during re-scrape'),
    ('scrape_retries', '3', 'Number of times to retry scraping on failure'),
    ('israeli_bank_scrapers_version', '"latest"', 'Specific version or branch of the scraper library (e.g. "latest", "master", "6.6.0")')
ON CONFLICT (key) DO NOTHING;
