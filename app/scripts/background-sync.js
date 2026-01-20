import { Pool } from 'pg';
import logger from '../utils/logger.js';
import { decrypt } from '../pages/api/utils/encryption.js';
import {
    prepareCredentials,
    validateCredentials,
    getScraperOptions,
    runScraper,
    insertTransaction,
    insertScrapeAudit,
    updateScrapeAudit,
    updateCredentialLastSynced,
    getFetchCategoriesSetting,
    getScraperTimeout,
    checkScraperConcurrency
} from '../pages/api/utils/scraperUtils.js';
import { APP_SETTINGS_KEYS, FETCH_SETTING_SQL } from '../utils/constants.js';


// Standalone DB connection for the script
const pool = new Pool({
    user: process.env.NUDLERS_DB_USER,
    host: process.env.NUDLERS_DB_HOST,
    database: process.env.NUDLERS_DB_NAME,
    password: process.env.NUDLERS_DB_PASSWORD,
    port: process.env.NUDLERS_DB_PORT ? parseInt(process.env.NUDLERS_DB_PORT) : 5432,
    ssl: false,
});

async function getDB() {
    return await pool.connect();
}

async function runBackgroundSync() {
    const client = await getDB();
    logger.info('[Background Sync] Started');

    try {
        // Check for other running scrapers
        try {
            await checkScraperConcurrency(client);
        } catch (concurrencyError) {
            logger.warn({ error: concurrencyError.message }, '[Background Sync] Concurrency check failed, skipping');
            return;
        }

        // Check if sync is enabled
        const syncEnabledRes = await client.query(FETCH_SETTING_SQL, [APP_SETTINGS_KEYS.SYNC_ENABLED]);
        const syncEnabled = syncEnabledRes.rows[0]?.value === true || syncEnabledRes.rows[0]?.value === 'true';

        if (!syncEnabled) {
            logger.info('[Background Sync] Disabled in settings, skipping');
            return;
        }

        // Get sync days back
        const daysBackRes = await client.query(FETCH_SETTING_SQL, [APP_SETTINGS_KEYS.SYNC_DAYS_BACK]);
        const daysBack = parseInt(daysBackRes.rows[0]?.value) || 30;

        // Get all active accounts
        const accountsResult = await client.query(`
      SELECT id, vendor, username, password, id_number, card6_digits, nickname, bank_account_number
      FROM vendor_credentials
      WHERE is_active = true
      ORDER BY last_synced_at ASC NULLS FIRST, id ASC
    `);

        if (accountsResult.rows.length === 0) {
            logger.info('[Background Sync] No active accounts to sync');
            return;
        }

        const fetchCategoriesSetting = await getFetchCategoriesSetting(client);

        for (const row of accountsResult.rows) {
            const companyId = row.vendor;

            logger.info({ vendor: companyId, nickname: row.nickname }, '[Background Sync] Syncing account');

            // Decrypt credentials
            const rawCredentials = {
                username: row.username ? decrypt(row.username) : null,
                password: row.password ? decrypt(row.password) : null,
                id: row.id_number ? decrypt(row.id_number) : null,
                card6Digits: row.card6_digits ? decrypt(row.card6_digits) : null,
                bank_account_number: row.bank_account_number
            };

            const scraperCredentials = prepareCredentials(companyId, rawCredentials);

            try {
                validateCredentials(scraperCredentials, companyId);
            } catch (err) {
                logger.error({ vendor: companyId, error: err.message }, '[Background Sync] Invalid credentials');
                continue;
            }

            const timeoutSetting = await getScraperTimeout(client, companyId);

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysBack);

            const scraperOptions = getScraperOptions(companyId, startDate, {
                showBrowser: false,
                fetchCategories: fetchCategoriesSetting,
                timeout: timeoutSetting,
            });

            const auditId = await insertScrapeAudit(client, 'background-sync', companyId, startDate);

            try {
                const result = await runScraper(client, scraperOptions, scraperCredentials);

                if (!result.success) {
                    throw new Error(result.errorMessage || 'Scraping failed');
                }

                let savedCount = 0;
                for (const account of result.accounts) {
                    if (!account.txns || !Array.isArray(account.txns)) continue;

                    for (const txn of account.txns) {
                        const defaultCurrency = txn.originalCurrency || txn.chargedCurrency || 'ILS';
                        const insertRes = await insertTransaction(client, txn, companyId, account.accountNumber, defaultCurrency);
                        if (insertRes.success && !insertRes.duplicated) {
                            savedCount++;
                        }
                    }
                }

                await updateScrapeAudit(client, auditId, 'success', `Background sync completed: saved ${savedCount} txns`);
                await updateCredentialLastSynced(client, row.id);
                logger.info({ vendor: companyId, savedCount }, '[Background Sync] Account sync completed');

            } catch (err) {
                logger.error({ vendor: companyId, error: err.message }, '[Background Sync] Account sync failed');
                await updateScrapeAudit(client, auditId, 'failed', err.message);
            }
        }

        logger.info('[Background Sync] Finished all accounts');
    } catch (error) {
        logger.error({ error: error.message }, '[Background Sync] Fatal error');
    } finally {
        client.release();
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runBackgroundSync().then(() => pool.end());
}

export { runBackgroundSync };
