import { Pool } from 'pg';
import { runScraper, prepareCredentials, getScraperOptions } from '../pages/api/utils/scraperUtils.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
    user: process.env.NUDLERS_DB_USER,
    host: process.env.NUDLERS_DB_HOST,
    database: process.env.NUDLERS_DB_NAME,
    password: process.env.NUDLERS_DB_PASSWORD,
    port: process.env.NUDLERS_DB_PORT ? parseInt(process.env.NUDLERS_DB_PORT) : 5432,
    ssl: false,
});

async function test() {
    const client = await pool.connect();
    try {
        const credsResult = await client.query("SELECT * FROM vendor_credentials WHERE vendor = 'leumi' AND is_active = true LIMIT 1");
        if (credsResult.rows.length === 0) throw new Error('No creds');
        const row = credsResult.rows[0];

        const { decrypt } = await import('../pages/api/utils/encryption.js');
        const rawCreds = {
            username: row.username ? decrypt(row.username) : null,
            password: row.password ? decrypt(row.password) : null,
        };
        const creds = prepareCredentials('leumi', rawCreds);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);

        const scraperOptions = getScraperOptions('leumi', startDate, {
            showBrowser: true,
            fetchCategories: true,
            timeout: 240000,
            verbose: true,
            logRequests: false
        });

        console.log('Starting Test Scrape (Simulating App)...');
        const result = await runScraper(client, scraperOptions, creds, (c, p) => console.log(`[Progress] ${p.type}: ${p.message || ''}`));

        if (result.success) {
            console.log('SUCCESS!');
        } else {
            console.error('FAILED:', result.errorMessage);
            // Save screenshot
            const fs = await import('fs');
            // We can't easily get the page object here since it's internal to runScraper/Scraper
            // But if we run in verbose mode, the scraper logs might help. 
            // For now, let's rely on the user observing the browser.
        }
    } catch (e) {
        console.error('Test Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

test();
