-- Add balance and balance_updated_at to card_ownership
ALTER TABLE card_ownership ADD COLUMN IF NOT EXISTS balance FLOAT;
ALTER TABLE card_ownership ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMP;
