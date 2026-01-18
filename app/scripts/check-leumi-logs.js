import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

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

async function checkLeumiLogs() {
    const client = await pool.connect();
    try {
        console.log('=== Recent Leumi Scrape Events ===\n');

        const result = await client.query(`
            SELECT id, vendor, status, message, created_at, 
                   report_json->>'accounts' as accounts,
                   report_json->>'transactions' as transactions,
                   report_json->>'savedTransactions' as saved,
                   report_json->>'duplicateTransactions' as duplicates
            FROM scrape_events
            WHERE vendor = 'leumi'
            ORDER BY created_at DESC
            LIMIT 10
        `);

        if (result.rows.length === 0) {
            console.log('No Leumi scrape events found.');
        } else {
            result.rows.forEach((row, i) => {
                console.log(`\n[${i + 1}] Event ID: ${row.id}`);
                console.log(`    Status: ${row.status}`);
                console.log(`    Created: ${row.created_at}`);
                console.log(`    Message: ${row.message}`);
                if (row.accounts) {
                    console.log(`    Stats: ${row.accounts} accounts, ${row.transactions} txns, ${row.saved} saved, ${row.duplicates} duplicates`);
                }
            });
        }

        console.log('\n\n=== Recent Sync Now Events (All Vendors) ===\n');

        const syncResult = await client.query(`
            SELECT id, vendor, status, message, created_at
            FROM scrape_events
            WHERE triggered_by LIKE '%sync%' OR message LIKE '%Sync%'
            ORDER BY created_at DESC
            LIMIT 10
        `);

        if (syncResult.rows.length === 0) {
            console.log('No sync events found.');
        } else {
            syncResult.rows.forEach((row, i) => {
                console.log(`\n[${i + 1}] ${row.vendor} - ${row.status}`);
                console.log(`    Created: ${row.created_at}`);
                console.log(`    Message: ${row.message}`);
            });
        }

    } finally {
        client.release();
        await pool.end();
    }
}

checkLeumiLogs().catch(console.error);
