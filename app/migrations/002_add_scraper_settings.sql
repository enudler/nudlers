-- Migration 002: Ensure new scraper settings exist and cleanup old ones
-- This migration runs for existing installations where 001 has already run

-- 1. Add new settings if they don't exist
INSERT INTO app_settings (key, value, description) VALUES
  ('scraper_log_http_requests', 'false', 'Log detailed HTTP requests for scraper debugging'),
  ('update_category_on_rescrape', 'false', 'If a transaction is re-scraped, update it if the bank provides a new category'),
  ('scraper_timeout', '60000', 'Maximum time (ms) allowed for each scraper to run')
ON CONFLICT (key) DO NOTHING;

-- 2. Remove deprecated settings
DELETE FROM app_settings WHERE key = 'show_browser';
