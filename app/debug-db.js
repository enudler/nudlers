import 'dotenv/config';
import pkg from 'pg';
const { Client } = pkg;
import { BANK_VENDORS } from './utils/constants.js';

async function checkData() {
    const client = new Client({
        user: process.env.NUDLERS_DB_USER,
        host: process.env.NUDLERS_DB_HOST,
        database: process.env.NUDLERS_DB_NAME,
        password: process.env.NUDLERS_DB_PASSWORD,
        port: process.env.NUDLERS_DB_PORT ? parseInt(process.env.NUDLERS_DB_PORT) : 5432,
    });
    await client.connect();

    try {
        console.log('--- Current Context ---');
        const now = new Date();
        console.log(`Now: ${now.toISOString()}`);

        const settingsResult = await client.query("SELECT key, value FROM app_settings WHERE key IN ('billing_cycle_start_day', 'payroll_day')");
        console.log('Settings:', settingsResult.rows);

        console.log('\n--- Bank Vendors ---');
        console.log(BANK_VENDORS);

        console.log('\n--- Card to Bank Links ---');
        const links = await client.query(`
            SELECT 
                c.vendor as card_vendor, c.account_number as card_acc,
                b.vendor as bank_vendor, b.account_number as bank_acc,
                c.linked_bank_account_id
            FROM card_ownership c
            LEFT JOIN card_ownership b ON c.linked_bank_account_id = b.id
            WHERE c.linked_bank_account_id IS NOT NULL
        `);
        console.table(links.rows);

        console.log('\n--- Recent Credit Card Transactions ---');
        const ccTrx = await client.query(`
            SELECT vendor, account_number, name, price, date, processed_date 
            FROM transactions 
            WHERE vendor NOT IN (${BANK_VENDORS.map(v => `'${v}'`).join(', ')})
            ORDER BY date DESC LIMIT 20
        `);
        console.table(ccTrx.rows);

        // Test the matching logic used in projection.js
        console.log('\n--- Effective Month SQL Test ---');
        const startDay = 10;
        const effectiveMonthSql = `
            TO_CHAR(
                CASE 
                    WHEN processed_date IS NOT NULL AND processed_date != date
                    THEN (
                        CASE 
                            WHEN EXTRACT(DAY FROM processed_date) > ${startDay} 
                            THEN (processed_date + INTERVAL '1 month')
                            ELSE processed_date
                        END
                    )
                    WHEN EXTRACT(DAY FROM COALESCE(processed_date, date)) >= ${startDay} 
                    THEN (COALESCE(processed_date, date) + INTERVAL '1 month')
                    ELSE COALESCE(processed_date, date)
                END, 
                'YYYY-MM'
            )
        `;

        const sqlTest = await client.query(`
            SELECT vendor, account_number, date, processed_date, (${effectiveMonthSql}) as effective_month
            FROM transactions 
            WHERE vendor NOT IN (${BANK_VENDORS.map(v => `'${v}'`).join(', ')})
            ORDER BY date DESC LIMIT 10
        `);
        console.table(sqlTest.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

checkData();
