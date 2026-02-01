-- Add is_hidden flag to card_ownership to allow users to hide duplicate or junk accounts
ALTER TABLE card_ownership ADD COLUMN is_hidden BOOLEAN DEFAULT false;
