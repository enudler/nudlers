import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.NUDLERS_DB_USER,
    host: process.env.NUDLERS_DB_HOST,
    database: process.env.NUDLERS_DB_NAME,
    password: process.env.NUDLERS_DB_PASSWORD,
    port: process.env.NUDLERS_DB_PORT ? parseInt(process.env.NUDLERS_DB_PORT) : 5432,
});

async function updateSettings() {
    console.log('Starting settings cleanup and update...');

    try {
        // 1. Delete unused settings
        const settingsToDelete = ['sync_interval_hours', 'israeli_bank_scrapers_version'];

        console.log('\n[1/2] Removing unused settings...');
        const checkRes = await pool.query('SELECT key, value FROM app_settings WHERE key = ANY($1)', [settingsToDelete]);

        if (checkRes.rows.length > 0) {
            console.log('Found the following settings to delete:');
            checkRes.rows.forEach(row => console.log(`  - ${row.key}: ${row.value}`));

            const deleteRes = await pool.query('DELETE FROM app_settings WHERE key = ANY($1)', [settingsToDelete]);
            console.log(`✓ Deleted ${deleteRes.rowCount} unused settings.`);
        } else {
            console.log('✓ No unused settings found to delete.');
        }

        // 2. Update descriptions for all settings
        console.log('\n[2/2] Updating setting descriptions...');

        const descriptionUpdates = [
            ['sync_enabled', 'Enable or disable the daily background transaction synchronization'],
            ['sync_days_back', 'Number of past days to fetch during each account sync'],
            ['default_currency', 'The default currency symbol used for display (e.g., ILS, USD)'],
            ['date_format', 'The visual format used for displaying dates (e.g., DD/MM/YYYY)'],
            ['billing_cycle_start_day', 'The day of the month when your credit card billing cycle begins'],

            ['fetch_categories_from_scrapers', 'Automatically adopt categories provided by the bank/card scraper'],
            ['update_category_on_rescrape', 'If a transaction is re-scraped, update it if the bank provides a new category'],
            ['scraper_timeout', 'Maximum time (ms) allowed for each scraper to run'],
            ['scraper_log_http_requests', 'Log detailed HTTP requests for scraper debugging'],
            ['gemini_api_key', 'Google Gemini API key for AI Chat and smart summaries'],
            ['gemini_model', 'The specific Google Gemini AI model version to use'],
            ['whatsapp_enabled', 'Send a financial summary via WhatsApp daily'],
            ['whatsapp_hour', 'The hour (0-23) when the daily WhatsApp summary is sent'],
            ['whatsapp_twilio_sid', 'Your Twilio Account SID for WhatsApp API access'],
            ['whatsapp_twilio_auth_token', 'Your Twilio Auth Token for WhatsApp API access'],
            ['whatsapp_twilio_from', 'The Twilio number from which summaries are sent'],
            ['whatsapp_to', 'The phone number to receive WhatsApp summaries (e.g., whatsapp:+972...)'],
            ['whatsapp_last_sent_date', 'Internal tracker to ensure only one WhatsApp message is sent per day'],
            ['whatsapp_summary_mode', 'Time period for the summary: calendar (monthly) or cycle (billing)'],
            ['sync_last_run_at', 'Internal timestamp tracker for the most recent sync execution'],
            ['sync_hour', 'The hour (0-23) when the daily background sync should run']
        ];

        let updateCount = 0;
        for (const [key, description] of descriptionUpdates) {
            const result = await pool.query(
                'UPDATE app_settings SET description = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
                [description, key]
            );
            if (result.rowCount > 0) {
                updateCount++;
            }
        }

        console.log(`✓ Updated descriptions for ${updateCount} settings.`);
        console.log('\n✅ Settings cleanup and update completed successfully!');

    } catch (err) {
        console.error('❌ Error updating settings:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

updateSettings();
