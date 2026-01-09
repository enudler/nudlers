import { getDB } from "./db";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await getDB();
  const migrations = [];
  
  try {
    // Migration 1: Add account_number column to transactions if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'transactions' AND column_name = 'account_number') THEN
          ALTER TABLE transactions ADD COLUMN account_number VARCHAR(50);
        END IF;
      END $$;
    `);
    migrations.push('transactions.account_number');
    
    // Migration 2: Add is_active column to vendor_credentials if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'vendor_credentials' AND column_name = 'is_active') THEN
          ALTER TABLE vendor_credentials ADD COLUMN is_active BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `);
    migrations.push('vendor_credentials.is_active');
    
    // Migration 2b: Add last_synced_at column to vendor_credentials if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'vendor_credentials' AND column_name = 'last_synced_at') THEN
          ALTER TABLE vendor_credentials ADD COLUMN last_synced_at TIMESTAMP;
        END IF;
      END $$;
    `);
    migrations.push('vendor_credentials.last_synced_at');
    
    // Migration 3: Create card_vendors table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS card_vendors (
        id SERIAL PRIMARY KEY,
        last4_digits VARCHAR(4) NOT NULL UNIQUE,
        card_vendor VARCHAR(50) NOT NULL,
        card_nickname VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    migrations.push('card_vendors table');
    
    // Create index for card_vendors
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_card_vendors_last4 ON card_vendors(last4_digits);
    `);
    migrations.push('card_vendors index');
    
    // Migration 4: Create card_ownership table for tracking which credential owns each card
    await client.query(`
      CREATE TABLE IF NOT EXISTS card_ownership (
        id SERIAL PRIMARY KEY,
        vendor VARCHAR(50) NOT NULL,
        account_number VARCHAR(50) NOT NULL,
        credential_id INTEGER NOT NULL REFERENCES vendor_credentials(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vendor, account_number)
      );
    `);
    migrations.push('card_ownership table');
    
    // Create indexes for card_ownership
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_card_ownership_vendor ON card_ownership(vendor);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_card_ownership_credential ON card_ownership(credential_id);
    `);
    migrations.push('card_ownership indexes');
    
    // Migration 5: Auto-populate card_ownership based on existing transactions
    // For each (vendor, account_number) combination, assign ownership to the credential
    // that has the most transactions for that card
    const populateResult = await client.query(`
      INSERT INTO card_ownership (vendor, account_number, credential_id)
      SELECT DISTINCT ON (t.vendor, t.account_number) 
        t.vendor, 
        t.account_number, 
        vc.id as credential_id
      FROM transactions t
      JOIN vendor_credentials vc ON t.vendor = vc.vendor
      WHERE t.account_number IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM card_ownership co 
          WHERE co.vendor = t.vendor AND co.account_number = t.account_number
        )
      GROUP BY t.vendor, t.account_number, vc.id
      ORDER BY t.vendor, t.account_number, COUNT(*) DESC
      ON CONFLICT (vendor, account_number) DO NOTHING
    `);
    migrations.push(`card_ownership auto-populated for existing cards (${populateResult.rowCount || 0} cards)`);
    
    // Migration 6: Remove old dedup_key column and index if they exist (cleanup from previous approach)
    await client.query(`DROP INDEX IF EXISTS idx_transactions_dedup_key`);
    await client.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'dedup_key') THEN
          ALTER TABLE transactions DROP COLUMN dedup_key;
        END IF;
      END $$;
    `);
    migrations.push('Removed old dedup_key column/index (cleanup)');
    
    // Migration 7: Create unique index on business fields for duplicate prevention
    // This is a secondary defense that catches duplicates that slip through identifier-based checks
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_business_key 
        ON transactions (vendor, date, LOWER(TRIM(name)), ABS(price), COALESCE(account_number, ''))
        WHERE vendor NOT LIKE 'manual_%';
      `);
      migrations.push('Created unique business key index for duplicate prevention');
    } catch (e) {
      // If index creation fails due to existing duplicates, log but continue
      if (e.code === '23505') {
        migrations.push('WARNING: Could not create unique business key index - existing duplicates detected. Run /api/duplicates to clean up.');
      } else {
        throw e;
      }
    }
    
    // Migration 8: Create index for efficient duplicate detection queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_duplicate_check 
      ON transactions (vendor, date, ABS(price));
    `);
    migrations.push('Created duplicate check index');
    
    // Migration 9: Create potential_duplicates table for tracking detected duplicates
    await client.query(`
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
    `);
    migrations.push('Created potential_duplicates table');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_potential_duplicates_status ON potential_duplicates(status);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_potential_duplicates_created ON potential_duplicates(created_at DESC);
    `);
    migrations.push('Created potential_duplicates indexes');
    
    // Migration 10: Create budgets table for general category spending limits
    // First check if the old table with 'cycle' column exists and migrate it
    const cycleColumnExists = await client.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'budgets' AND column_name = 'cycle'
    `);
    
    if (cycleColumnExists.rows.length > 0) {
      // Old schema exists - migrate to new schema
      // Keep the highest budget_limit per category
      await client.query(`
        CREATE TEMP TABLE temp_budgets AS
        SELECT category, MAX(budget_limit) as budget_limit
        FROM budgets
        GROUP BY category;
      `);
      
      await client.query(`DROP TABLE budgets;`);
      
      await client.query(`
        CREATE TABLE budgets (
          id SERIAL PRIMARY KEY,
          category VARCHAR(50) NOT NULL UNIQUE,
          budget_limit FLOAT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await client.query(`
        INSERT INTO budgets (category, budget_limit)
        SELECT category, budget_limit FROM temp_budgets;
      `);
      
      await client.query(`DROP TABLE temp_budgets;`);
      migrations.push('Migrated budgets table from month-specific to general budgets');
    } else {
      // Create fresh budgets table
      await client.query(`
        CREATE TABLE IF NOT EXISTS budgets (
          id SERIAL PRIMARY KEY,
          category VARCHAR(50) NOT NULL UNIQUE,
          budget_limit FLOAT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      migrations.push('Created budgets table');
    }
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
    `);
    migrations.push('Created budgets index');
    
    // Migration 11: Create scheduled_sync_runs table for tracking automatic background sync runs
    await client.query(`
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
    `);
    migrations.push('Created scheduled_sync_runs table');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_sync_runs_started ON scheduled_sync_runs(started_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_sync_runs_status ON scheduled_sync_runs(status);
    `);
    migrations.push('Created scheduled_sync_runs indexes');
    
    // Migration 12: Create scheduled_sync_config table for sync configuration
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_sync_config (
        id SERIAL PRIMARY KEY,
        is_enabled BOOLEAN DEFAULT true,
        schedule_hours INTEGER[] DEFAULT ARRAY[6, 18],
        days_to_sync INTEGER DEFAULT 7,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    migrations.push('Created scheduled_sync_config table');
    
    // Insert default config if not exists
    await client.query(`
      INSERT INTO scheduled_sync_config (is_enabled, schedule_hours, days_to_sync)
      SELECT true, ARRAY[6, 18], 7
      WHERE NOT EXISTS (SELECT 1 FROM scheduled_sync_config);
    `);
    migrations.push('Inserted default scheduled_sync_config');
    
    res.status(200).json({ 
      message: 'Migration completed successfully',
      migrations
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}
