import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
    user: process.env.NUDLERS_DB_USER,
    host: process.env.NUDLERS_DB_HOST,
    database: process.env.NUDLERS_DB_NAME,
    password: process.env.NUDLERS_DB_PASSWORD,
    port: process.env.NUDLERS_DB_PORT ? parseInt(process.env.NUDLERS_DB_PORT) : 5432,
});

async function cleanupSettings() {
    const settingsToDelete = [
        'scraper_timeout_standard',
        'scraper_timeout_rate_limited',
        'rate_limit_wait_seconds',
        'show_browser'
    ];

    try {
        console.log('Starting cleanup of unused settings...');

        // Check current settings before deletion
        const checkRes = await pool.query('SELECT key, value FROM app_settings WHERE key = ANY($1)', [settingsToDelete]);
        console.log('Found the following settings to delete:');
        checkRes.rows.forEach(row => console.log(`- ${row.key}: ${row.value}`));

        if (checkRes.rows.length === 0) {
            console.log('No settings to delete found.');
        } else {
            // Delete settings
            const deleteRes = await pool.query('DELETE FROM app_settings WHERE key = ANY($1)', [settingsToDelete]);
            console.log(`Successfully deleted ${deleteRes.rowCount} settings.`);
        }

        console.log('Cleanup complete.');
    } catch (err) {
        console.error('Error cleaning up settings:', err);
    } finally {
        await pool.end();
    }
}

cleanupSettings();
