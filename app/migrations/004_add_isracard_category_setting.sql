-- Migration to add Isracard/Amex category scraping toggle
-- Adds the default setting to the app_settings table

INSERT INTO app_settings (key, value, description)
VALUES ('isracard_scrape_categories', 'true', 'Whether to fetch categories from Isracard/Amex API (slower but provides bank categorization)')
ON CONFLICT (key) DO NOTHING;
