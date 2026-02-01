-- Create manual recurring payments table
CREATE TABLE IF NOT EXISTS manual_recurring_payments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    amount FLOAT NOT NULL,
    category VARCHAR(50),
    account_number VARCHAR(50),
    day_of_month INTEGER NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
    frequency VARCHAR(20) DEFAULT 'monthly',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_manual_recurring_active ON manual_recurring_payments(is_active);
