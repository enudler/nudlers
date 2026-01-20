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
        console.log('Checking for visaCal credentials...');
        const credsResult = await client.query("SELECT * FROM vendor_credentials WHERE vendor = 'visaCal' AND is_active = true LIMIT 1");
        if (credsResult.rows.length === 0) {
            console.error('No active visaCal credentials found in DB.');
            return;
        }
        const row = credsResult.rows[0];
        console.log('Found credential ID:', row.id);

        const { decrypt } = await import('../pages/api/utils/encryption.js');

        const safeDecrypt = (value) => {
            if (!value || typeof value !== 'string' || value.trim() === '') return null;
            try { return decrypt(value); } catch (e) { console.error('Decrypt error:', e.message); return null; }
        };

        const rawCreds = {
            username: safeDecrypt(row.username),
            password: safeDecrypt(row.password),
        };

        const creds = prepareCredentials('visaCal', rawCreds);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30); // 30 days back

        const scraperOptions = getScraperOptions('visaCal', startDate, {
            showBrowser: false, // Run headless to be faster/standard, or true if we want to watch (headless is better for logs usually unless debugging UI)
            fetchCategories: true,
            timeout: 120000,
            verbose: true,
            logRequests: true,
            companyId: 'visaCal'
        });

        console.log('Starting Cal Scrape...');
        const result = await runScraper(client, scraperOptions, creds, (c, p) => console.log(`[Progress] ${p.type}: ${p.message || ''}`));

        if (result.success) {
            console.log('SUCCESS!', result.accounts?.length, 'accounts found');
        } else {
            console.error('FAILED:', result.errorMessage);
            console.error('Error Details:', result.errorType);
        }
    } catch (e) {
        console.error('Test Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

test();
