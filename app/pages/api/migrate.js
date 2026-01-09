import { getDB } from "./db";

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
    name: 'create_transactions_duplicate_check_index',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_transactions_duplicate_check 
      ON transactions (vendor, date, ABS(price));
    `
  },
  {
    name: 'create_potential_duplicates_table',
    sql: `
      CREATE TABLE IF NOT EXISTS potential_duplicates (
        id SERIAL PRIMARY KEY,
        transaction1_id VARCHAR(50) NOT NULL,
        transaction1_vendor VARCHAR(50) NOT NULL,
        transaction2_id VARCHAR(50) NOT NULL,
        transaction2_vendor VARCHAR(50) NOT NULL,
        similarity_score FLOAT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        resolved_at TIMESTAMP,
        resolved_action VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(transaction1_id, transaction1_vendor, transaction2_id, transaction2_vendor)
      );
    `
  },
  {
    name: 'create_potential_duplicates_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_potential_duplicates_status ON potential_duplicates(status);
      CREATE INDEX IF NOT EXISTS idx_potential_duplicates_created ON potential_duplicates(created_at DESC);
    `
  },
  {
    name: 'create_scheduled_sync_runs_table',
    sql: `
      CREATE TABLE IF NOT EXISTS scheduled_sync_runs (
        id SERIAL PRIMARY KEY,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        total_accounts INTEGER DEFAULT 0,
        successful_accounts INTEGER DEFAULT 0,
        failed_accounts INTEGER DEFAULT 0,
        total_transactions INTEGER DEFAULT 0,
        error_message TEXT,
        details JSONB,
        triggered_by VARCHAR(50) DEFAULT 'scheduler'
      );
    `
  },
  {
    name: 'create_scheduled_sync_runs_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_scheduled_sync_runs_started ON scheduled_sync_runs(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_scheduled_sync_runs_status ON scheduled_sync_runs(status);
    `
  },
  {
    name: 'create_scheduled_sync_config_table',
    sql: `
      CREATE TABLE IF NOT EXISTS scheduled_sync_config (
        id SERIAL PRIMARY KEY,
        is_enabled BOOLEAN DEFAULT true,
        schedule_hours INTEGER[] DEFAULT ARRAY[6, 18],
        days_to_sync INTEGER DEFAULT 7,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    name: 'insert_default_scheduled_sync_config',
    sql: `
      INSERT INTO scheduled_sync_config (is_enabled, schedule_hours, days_to_sync)
      SELECT true, ARRAY[6, 18], 7
      WHERE NOT EXISTS (SELECT 1 FROM scheduled_sync_config);
    `
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
    warningOnFail: 'Could not create unique business key index - existing duplicates may be present. Run /api/duplicates to clean up.'
  }
];

export async function runMigrations() {
  const client = await getDB();
  const results = [];
  
  try {
    console.log('[migrate] Starting database migrations...');
    
    // Run all required migrations
    for (const migration of migrations) {
      try {
        await client.query(migration.sql);
        results.push({ name: migration.name, status: 'success' });
        console.log(`[migrate] ✓ ${migration.name}`);
      } catch (error) {
        console.error(`[migrate] ✗ ${migration.name}:`, error.message);
        results.push({ name: migration.name, status: 'error', error: error.message });
        throw error; // Stop on required migration failure
      }
    }
    
    // Run optional migrations (don't fail if they error)
    for (const migration of optionalMigrations) {
      try {
        await client.query(migration.sql);
        results.push({ name: migration.name, status: 'success' });
        console.log(`[migrate] ✓ ${migration.name}`);
      } catch (error) {
        if (error.code === '23505') {
          // Duplicate key violation - expected if duplicates exist
          results.push({ name: migration.name, status: 'warning', warning: migration.warningOnFail });
          console.warn(`[migrate] ⚠ ${migration.name}: ${migration.warningOnFail}`);
        } else {
          results.push({ name: migration.name, status: 'warning', warning: error.message });
          console.warn(`[migrate] ⚠ ${migration.name}: ${error.message}`);
        }
      }
    }
    
    console.log('[migrate] Database migrations completed successfully');
    return { success: true, migrations: results };
  } catch (error) {
    console.error('[migrate] Migration failed:', error);
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
