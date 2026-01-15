import { getDB } from "./db";
import logger from '../../utils/logger.js';

// All migrations in order - each should be idempotent (safe to run multiple times)
const migrations = [
  {
    name: 'create_transactions_table',
    sql: `
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
        PRIMARY KEY (identifier, vendor)
      );
    `
  },
  {
    name: 'create_vendor_credentials_table',
    sql: `
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
    `
  },
  {
    name: 'add_is_active_to_vendor_credentials',
    sql: `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'vendor_credentials' AND column_name = 'is_active') THEN
          ALTER TABLE vendor_credentials ADD COLUMN is_active BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `
  },
  {
    name: 'add_last_synced_at_to_vendor_credentials',
    sql: `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'vendor_credentials' AND column_name = 'last_synced_at') THEN
          ALTER TABLE vendor_credentials ADD COLUMN last_synced_at TIMESTAMP;
        END IF;
      END $$;
    `
  },
  {
    name: 'create_categorization_rules_table',
    sql: `
      CREATE TABLE IF NOT EXISTS categorization_rules (
        id SERIAL PRIMARY KEY,
        name_pattern VARCHAR(200) NOT NULL,
        target_category VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name_pattern, target_category)
      );
    `
  },
  {
    name: 'create_categorization_rules_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_categorization_rules_pattern ON categorization_rules(name_pattern);
      CREATE INDEX IF NOT EXISTS idx_categorization_rules_active ON categorization_rules(is_active);
    `
  },
  {
    name: 'create_scrape_events_table',
    sql: `
      CREATE TABLE IF NOT EXISTS scrape_events (
        id SERIAL PRIMARY KEY,
        triggered_by VARCHAR(100),
        vendor VARCHAR(100) NOT NULL,
        start_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'started',
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    name: 'create_scrape_events_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_scrape_events_created_at ON scrape_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_scrape_events_vendor ON scrape_events(vendor);
    `
  },
  {
    name: 'add_account_number_to_transactions',
    sql: `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'transactions' AND column_name = 'account_number') THEN
          ALTER TABLE transactions ADD COLUMN account_number VARCHAR(50);
        END IF;
      END $$;
    `
  },
  {
    name: 'create_card_ownership_table',
    sql: `
      CREATE TABLE IF NOT EXISTS card_ownership (
        id SERIAL PRIMARY KEY,
        vendor VARCHAR(50) NOT NULL,
        account_number VARCHAR(50) NOT NULL,
        credential_id INTEGER NOT NULL REFERENCES vendor_credentials(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vendor, account_number)
      );
    `
  },
  {
    name: 'create_card_ownership_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_card_ownership_vendor ON card_ownership(vendor);
      CREATE INDEX IF NOT EXISTS idx_card_ownership_credential ON card_ownership(credential_id);
    `
  },
  {
    name: 'create_budgets_table',
    sql: `
      CREATE TABLE IF NOT EXISTS budgets (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL UNIQUE,
        budget_limit FLOAT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    name: 'create_budgets_index',
    sql: `CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);`
  },
  {
    name: 'migrate_budgets_from_cycle_schema',
    sql: `
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'budgets' AND column_name = 'cycle') THEN
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
    `
  },
  {
    name: 'create_card_vendors_table',
    sql: `
      CREATE TABLE IF NOT EXISTS card_vendors (
        id SERIAL PRIMARY KEY,
        last4_digits VARCHAR(4) NOT NULL UNIQUE,
        card_vendor VARCHAR(50) NOT NULL,
        card_nickname VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    name: 'create_card_vendors_index',
    sql: `CREATE INDEX IF NOT EXISTS idx_card_vendors_last4 ON card_vendors(last4_digits);`
  },
  {
    name: 'create_total_budget_table',
    sql: `
      CREATE TABLE IF NOT EXISTS total_budget (
        id SERIAL PRIMARY KEY,
        budget_limit FLOAT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    name: 'create_total_budget_single_row_constraint',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_total_budget_single_row ON total_budget ((true));`
  },
  {
    name: 'remove_old_dedup_key_column',
    sql: `
      DROP INDEX IF EXISTS idx_transactions_dedup_key;
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'dedup_key') THEN
          ALTER TABLE transactions DROP COLUMN dedup_key;
        END IF;
      END $$;
    `
  },
  {
    name: 'drop_potential_duplicates_feature',
    sql: `
      DROP TABLE IF EXISTS potential_duplicates;
      DROP INDEX IF EXISTS idx_transactions_duplicate_check;
    `
  },
  {
    name: 'create_app_settings_table',
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) NOT NULL UNIQUE,
        value JSONB NOT NULL,
        description VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    name: 'create_app_settings_index',
    sql: `CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);`
  },
  {
    name: 'insert_default_settings',
    sql: `
      INSERT INTO app_settings (key, value, description) VALUES
        ('sync_enabled', 'false', 'Enable automatic background sync'),
        ('sync_interval_hours', '24', 'Hours between automatic syncs'),
        ('sync_days_back', '30', 'Number of days to sync back for each account'),
        ('default_currency', '"ILS"', 'Default currency for transactions'),
        ('date_format', '"DD/MM/YYYY"', 'Date display format'),
        ('billing_cycle_start_day', '10', 'Day of month when billing cycle starts'),
        ('show_browser', 'false', 'Show browser window during scraping (for debugging/2FA)'),
        ('israeli_bank_scrapers_version', '"none"', 'Specific version or branch of the scraper library (e.g. "latest", "master", "6.6.0")')
      ON CONFLICT (key) DO NOTHING;
    `
  },
  {
    name: 'add_linked_bank_account_to_card_ownership',
    sql: `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'card_ownership' AND column_name = 'linked_bank_account_id') THEN
          ALTER TABLE card_ownership ADD COLUMN linked_bank_account_id INTEGER REFERENCES vendor_credentials(id) ON DELETE SET NULL;
          CREATE INDEX IF NOT EXISTS idx_card_ownership_bank_account ON card_ownership(linked_bank_account_id);
        END IF;
      END $$;
    `
  },
  {
    name: 'add_custom_bank_account_to_card_ownership',
    sql: `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'card_ownership' AND column_name = 'custom_bank_account_number') THEN
          ALTER TABLE card_ownership ADD COLUMN custom_bank_account_number VARCHAR(100);
          ALTER TABLE card_ownership ADD COLUMN custom_bank_account_nickname VARCHAR(100);
        END IF;
      END $$;
    `
  },
  {
    name: 'create_transaction_categories_table',
    sql: `
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
    `
  },
  {
    name: 'add_update_categories_on_rescrape_setting',
    sql: `
      INSERT INTO app_settings (key, value, description)
      VALUES ('update_category_on_rescrape', 'false', 'Update transaction categories if bank provides new ones during re-scrape')
      ON CONFLICT (key) DO NOTHING;
    `
  },
  {
    name: 'add_scrape_retries_setting',
    sql: `
      INSERT INTO app_settings (key, value, description)
      VALUES ('scrape_retries', '3', 'Number of times to retry scraping on failure')
      ON CONFLICT (key) DO NOTHING;
    `
  },
  {
    name: 'add_report_json_to_scrape_events',
    sql: `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'scrape_events' AND column_name = 'report_json') THEN
          ALTER TABLE scrape_events ADD COLUMN report_json JSONB;
        END IF;
      END $$;
    `
  },
  {
    name: 'add_source_columns_to_transactions',
    sql: `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'transactions' AND column_name = 'category_source') THEN
          ALTER TABLE transactions ADD COLUMN category_source VARCHAR(50);
          ALTER TABLE transactions ADD COLUMN rule_matched VARCHAR(255);
        END IF;
      END $$;
    `
  },
  {
    name: 'create_category_mappings_table',
    sql: `
      CREATE TABLE IF NOT EXISTS category_mappings (
        id SERIAL PRIMARY KEY,
        source_category VARCHAR(50) NOT NULL,
        target_category VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_category)
      );
      CREATE INDEX IF NOT EXISTS idx_category_mappings_source ON category_mappings(source_category);
    `
  },
  {
    name: 'create_chat_tables',
    sql: `
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
    `
  },
  {
    name: 'add_whatsapp_settings',
    sql: `
      INSERT INTO app_settings (key, value, description) VALUES
        ('whatsapp_enabled', 'false', 'Enable daily WhatsApp summary'),
        ('whatsapp_hour', '8', 'Hour of the day to send WhatsApp summary (0-23)'),
        ('whatsapp_twilio_sid', '""', 'Twilio Account SID'),
        ('whatsapp_twilio_auth_token', '""', 'Twilio Auth Token'),
        ('whatsapp_twilio_from', '""', 'Twilio WhatsApp "From" number'),
        ('whatsapp_to', '""', 'Destination WhatsApp number'),
        ('whatsapp_last_sent_date', '""', 'Date of last sent WhatsApp summary')
      ON CONFLICT (key) DO NOTHING;
    `
  },
  {
    name: 'add_gemini_model_setting',
    sql: `
      INSERT INTO app_settings (key, value, description)
      VALUES ('gemini_model', '"gemini-2.5-flash"', 'Gemini AI model to use (e.g., gemini-2.5-flash)')
      ON CONFLICT (key) DO NOTHING;
    `
  }
];

// Separate migration for unique business key index (may fail if duplicates exist)
const optionalMigrations = [
  {
    name: 'create_transactions_business_key_index',
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_business_key 
      ON transactions (vendor, date, LOWER(TRIM(name)), ABS(price), COALESCE(account_number, ''))
      WHERE vendor NOT LIKE 'manual_%';
    `,
    optional: true,
    warningOnFail: 'Could not create unique business key index - existing duplicates may be present.'
  }
];

export async function runMigrations() {
  const client = await getDB();
  const results = [];

  try {
    logger.info('[migrate] Starting database migrations');

    // Run all required migrations
    for (const migration of migrations) {
      try {
        await client.query(migration.sql);
        results.push({ name: migration.name, status: 'success' });
        logger.info({ migration: migration.name }, '[migrate] Migration completed');
      } catch (error) {
        logger.error({ migration: migration.name, error: error.message }, '[migrate] Migration failed');
        results.push({ name: migration.name, status: 'error', error: error.message });
        throw error; // Stop on required migration failure
      }
    }

    // Run optional migrations (don't fail if they error)
    for (const migration of optionalMigrations) {
      try {
        await client.query(migration.sql);
        results.push({ name: migration.name, status: 'success' });
        logger.info({ migration: migration.name }, '[migrate] Optional migration completed');
      } catch (error) {
        if (error.code === '23505') {
          // Duplicate key violation - expected if duplicates exist
          results.push({ name: migration.name, status: 'warning', warning: migration.warningOnFail });
          logger.warn({ migration: migration.name, warning: migration.warningOnFail }, '[migrate] Optional migration warning');
        } else {
          results.push({ name: migration.name, status: 'warning', warning: error.message });
          logger.warn({ migration: migration.name, error: error.message }, '[migrate] Optional migration warning');
        }
      }
    }

    logger.info('[migrate] Database migrations completed successfully');
    return { success: true, migrations: results };
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, '[migrate] Migration failed');
    return { success: false, migrations: results, error: error.message };
  } finally {
    client.release();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await runMigrations();

  if (result.success) {
    res.status(200).json({
      message: 'Migration completed successfully',
      migrations: result.migrations
    });
  } else {
    res.status(500).json({
      error: result.error,
      migrations: result.migrations
    });
  }
}
