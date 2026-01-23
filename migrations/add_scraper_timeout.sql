-- Migration: Add or update scraper_timeout setting
-- This fixes installations that have the old incorrect value (5000ms)
-- Run with: docker exec -i nudlers-nudlers-db-1 psql -U myuser -d nudlers < migrations/add_scraper_timeout.sql

INSERT INTO app_settings (key, value, description) 
VALUES ('scraper_timeout', '90000', 'Timeout in milliseconds for scraper operations (default: 90000ms = 90 seconds)')
ON CONFLICT (key) 
DO UPDATE SET 
  value = '90000',
  description = 'Timeout in milliseconds for scraper operations (default: 90000ms = 90 seconds)'
WHERE app_settings.value != '90000';  -- Only update if value is different
