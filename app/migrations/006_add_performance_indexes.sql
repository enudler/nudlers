-- Performance Optimization Indexes
-- Based on analysis of getTransactions and monthly-summary queries

-- 1. Optimize Date Range Filtering & Billing Cycle Calculations
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_processed_date ON transactions(processed_date);

-- 2. Optimize Filtering by Category, Account, and Name
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_account_number ON transactions(account_number);
CREATE INDEX IF NOT EXISTS idx_transactions_name ON transactions(name);

-- 3. Optimize Joins (transactions -> card_ownership)
-- Used heavily in getTransactions and monthly-summary joins
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_account ON transactions(vendor, account_number);

-- 4. Optimize Main List Query (DISTINCT ON + ORDER BY)
-- Supports: SELECT DISTINCT ON (identifier, vendor) ... ORDER BY identifier, vendor, date DESC
CREATE INDEX IF NOT EXISTS idx_transactions_lookup ON transactions(identifier, vendor, date DESC);

-- 5. Optimize Aggregations
-- Helpful for "GROUP BY name, category" in monthly-summary
CREATE INDEX IF NOT EXISTS idx_transactions_name_category ON transactions(name, category);

