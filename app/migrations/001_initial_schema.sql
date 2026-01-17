-- Transaction System Schema
-- Consolidated migration for fresh installs and updates

-- 1. Transactions
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
  account_number VARCHAR(50),      -- Added in later version
  transaction_type VARCHAR(20),    -- Added in later version
  category_source VARCHAR(50),     -- Added in later version
  rule_matched VARCHAR(255),       -- Added in later version
  PRIMARY KEY (identifier, vendor)
);

-- Idempotency checks for columns added later (for existing databases)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'account_number') THEN
    ALTER TABLE transactions ADD COLUMN account_number VARCHAR(50);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'transaction_type') THEN
    ALTER TABLE transactions ADD COLUMN transaction_type VARCHAR(20);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'category_source') THEN
    ALTER TABLE transactions ADD COLUMN category_source VARCHAR(50);
    ALTER TABLE transactions ADD COLUMN rule_matched VARCHAR(255);
  END IF;

  -- Remove old columns if they exist
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'dedup_key') THEN
    ALTER TABLE transactions DROP COLUMN dedup_key;
    DROP INDEX IF EXISTS idx_transactions_dedup_key;
  END IF;
END $$;


-- 2. Vendor Credentials
CREATE TABLE IF NOT EXISTS vendor_credentials (
  id SERIAL PRIMARY KEY,
  id_number VARCHAR(100),
  username VARCHAR(100),
  vendor VARCHAR(100) NOT NULL,
  password VARCHAR(100),
  card6_digits VARCHAR(100),
  nickname VARCHAR(100),
  bank_account_number VARCHAR(100),
  is_active BOOLEAN DEFAULT true,        -- Added in later version
  last_synced_at TIMESTAMP,              -- Added in later version
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id_number, username, vendor)
);

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_credentials' AND column_name = 'is_active') THEN
    ALTER TABLE vendor_credentials ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_credentials' AND column_name = 'last_synced_at') THEN
    ALTER TABLE vendor_credentials ADD COLUMN last_synced_at TIMESTAMP;
  END IF;
END $$;


-- 3. Categorization Rules
CREATE TABLE IF NOT EXISTS categorization_rules (
  id SERIAL PRIMARY KEY,
  name_pattern VARCHAR(200) NOT NULL,
  target_category VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name_pattern, target_category)
);

CREATE INDEX IF NOT EXISTS idx_categorization_rules_pattern ON categorization_rules(name_pattern);
CREATE INDEX IF NOT EXISTS idx_categorization_rules_active ON categorization_rules(is_active);


-- 4. Scrape Events
CREATE TABLE IF NOT EXISTS scrape_events (
  id SERIAL PRIMARY KEY,
  triggered_by VARCHAR(100),
  vendor VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'started',
  message TEXT,
  report_json JSONB,              -- Added in later version
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scrape_events_created_at ON scrape_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_events_vendor ON scrape_events(vendor);

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scrape_events' AND column_name = 'report_json') THEN
    ALTER TABLE scrape_events ADD COLUMN report_json JSONB;
  END IF;
END $$;


-- 5. Card Ownership
CREATE TABLE IF NOT EXISTS card_ownership (
  id SERIAL PRIMARY KEY,
  vendor VARCHAR(50) NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  credential_id INTEGER NOT NULL REFERENCES vendor_credentials(id) ON DELETE CASCADE,
  linked_bank_account_id INTEGER REFERENCES vendor_credentials(id) ON DELETE SET NULL, -- Added later
  custom_bank_account_number VARCHAR(100),     -- Added later
  custom_bank_account_nickname VARCHAR(100),   -- Added later
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vendor, account_number)
);

CREATE INDEX IF NOT EXISTS idx_card_ownership_vendor ON card_ownership(vendor);
CREATE INDEX IF NOT EXISTS idx_card_ownership_credential ON card_ownership(credential_id);

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_ownership' AND column_name = 'linked_bank_account_id') THEN
    ALTER TABLE card_ownership ADD COLUMN linked_bank_account_id INTEGER REFERENCES vendor_credentials(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_card_ownership_bank_account ON card_ownership(linked_bank_account_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_ownership' AND column_name = 'custom_bank_account_number') THEN
    ALTER TABLE card_ownership ADD COLUMN custom_bank_account_number VARCHAR(100);
    ALTER TABLE card_ownership ADD COLUMN custom_bank_account_nickname VARCHAR(100);
  END IF;
END $$;


-- 6. Budgets
CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL UNIQUE,
  budget_limit FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);

-- Legacy migration for budgets (from cycle schema)
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'cycle') THEN
    CREATE TEMP TABLE temp_budgets AS
    SELECT category, MAX(budget_limit) as budget_limit
    FROM budgets
    GROUP BY category;
    
    DROP TABLE budgets;
    
    CREATE TABLE budgets (
      id SERIAL PRIMARY KEY,
      category VARCHAR(50) NOT NULL UNIQUE,
      budget_limit FLOAT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    INSERT INTO budgets (category, budget_limit)
    SELECT category, budget_limit FROM temp_budgets;
    
    DROP TABLE temp_budgets;
  END IF;
END $$;


-- 7. Card Vendors
CREATE TABLE IF NOT EXISTS card_vendors (
  id SERIAL PRIMARY KEY,
  last4_digits VARCHAR(4) NOT NULL UNIQUE,
  card_vendor VARCHAR(50) NOT NULL,
  card_nickname VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_card_vendors_last4 ON card_vendors(last4_digits);


-- 8. Total Budget
CREATE TABLE IF NOT EXISTS total_budget (
  id SERIAL PRIMARY KEY,
  budget_limit FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_total_budget_single_row ON total_budget ((true));


-- 9. Transaction Categories
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


-- 10. Category Mappings
CREATE TABLE IF NOT EXISTS category_mappings (
  id SERIAL PRIMARY KEY,
  source_category VARCHAR(50) NOT NULL,
  target_category VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_category)
);
CREATE INDEX IF NOT EXISTS idx_category_mappings_source ON category_mappings(source_category);


-- 11. Chat Sessions
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


-- 12. App Settings
CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

INSERT INTO app_settings (key, value, description) VALUES
  ('sync_enabled', 'false', 'Enable or disable the daily background transaction synchronization'),
  ('sync_days_back', '30', 'Number of past days to fetch during each account sync'),
  ('default_currency', '"ILS"', 'The default currency symbol used for display (e.g., ILS, USD)'),
  ('date_format', '"DD/MM/YYYY"', 'The visual format used for displaying dates (e.g., DD/MM/YYYY)'),
  ('billing_cycle_start_day', '10', 'The day of the month when your credit card billing cycle begins'),
  ('show_browser', 'false', '(Local only) Display browser window during scraping for debugging/2FA'),
  ('update_category_on_rescrape', 'false', 'If a transaction is re-scraped, update it if the bank provides a new category'),
  ('scraper_timeout', '60000', 'Maximum time (ms) allowed for each scraper to run'),
  ('whatsapp_enabled', 'false', 'Send a financial summary via WhatsApp daily'),
  ('whatsapp_hour', '8', 'The hour (0-23) when the daily WhatsApp summary is sent'),
  ('whatsapp_twilio_sid', '""', 'Your Twilio Account SID for WhatsApp API access'),
  ('whatsapp_twilio_auth_token', '""', 'Your Twilio Auth Token for WhatsApp API access'),
  ('whatsapp_twilio_from', '""', 'The Twilio number from which summaries are sent'),
  ('whatsapp_to', '""', 'The phone number to receive WhatsApp summaries (e.g., whatsapp:+972...)'),
  ('whatsapp_last_sent_date', '""', 'Internal tracker to ensure only one WhatsApp message is sent per day'),
  ('gemini_model', '"gemini-2.5-flash"', 'The specific Google Gemini AI model version to use'),
  ('sync_last_run_at', '"1970-01-01T00:00:00.000Z"', 'Internal timestamp tracker for the most recent sync execution'),
  ('sync_hour', '3', 'The hour (0-23) when the daily background sync should run')
ON CONFLICT (key) DO NOTHING;


-- 13. Clean up
DROP TABLE IF EXISTS potential_duplicates;
DROP INDEX IF EXISTS idx_transactions_duplicate_check;

-- Optional Index (Clean up attempt logic preserved)
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_business_key 
    ON transactions (vendor, date, LOWER(TRIM(name)), ABS(price), COALESCE(account_number, ''))
    WHERE vendor NOT LIKE 'manual_%';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Could not create unique business key index - duplicates exist';
  END;
END $$;
