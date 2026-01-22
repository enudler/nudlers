import { getDB } from '../db';
import { decrypt } from '../utils/encryption';
import logger from '../../../utils/logger.js';
import {
    prepareCredentials,
    validateCredentials,
    getScraperOptions,
    runScraper,
    insertScrapeAudit,
    updateScrapeAudit,
    updateCredentialLastSynced,
    getFetchCategoriesSetting,
    getScraperTimeout,
    getScrapeRetries,
    getUpdateCategoryOnRescrapeSetting,
    getLogHttpRequestsSetting,
    getBillingCycleStartDay,
    processScrapedAccounts,
    loadCategorizationRules,
    loadCategoryMappings,
    checkScraperConcurrency,
} from '../utils/scraperUtils';
import { BANK_VENDORS } from '../../../utils/constants';

// Helper to send SSE messages to the local client
function sendSSE(res, event, data) {
    if (res && !res.destroyed && !res.finished && !res.writableEnded) {
        try {
            res.write(`event: ${event}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
            // Ignore if client disconnected
        }
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const client = await getDB();
    const startTime = Date.now();
    let clientDisconnected = false;

    res.on('close', () => {
        clientDisconnected = true;
        logger.info('[Sync All Stream] Client disconnected, continuing batch in background');
    });

    try {
        // Check for other running scrapers
        try {
            await checkScraperConcurrency(client);
        } catch (concurrencyError) {
            logger.warn({ error: concurrencyError.message }, '[Sync All Stream] Concurrency check failed');
            sendSSE(res, 'error', {
                message: concurrencyError.message,
                type: 'CONCURRENCY_ERROR'
            });
            res.end();
            return;
        }

        // 1. Get all active accounts
        const accountsResult = await client.query(`
      SELECT id, vendor, username, password, id_number, card6_digits, nickname, bank_account_number
      FROM vendor_credentials
      WHERE is_active = true
      ORDER BY last_synced_at ASC NULLS FIRST, id ASC
    `);

        if (accountsResult.rows.length === 0) {
            sendSSE(res, 'complete', { message: 'No active accounts to sync' });
            return res.end();
        }

        const accounts = accountsResult.rows.map(row => ({
            id: row.id,
            vendor: row.vendor,
            nickname: row.nickname || row.vendor,
            credentials: {
                username: row.username ? decrypt(row.username) : null,
                password: row.password ? decrypt(row.password) : null,
                id: row.id_number ? decrypt(row.id_number) : null,
                card6Digits: row.card6_digits ? decrypt(row.card6_digits) : null,
                bank_account_number: row.bank_account_number
            }
        }));

        const queueData = {
            total: accounts.length,
            accounts: accounts.map(a => ({ id: a.id, nickname: a.nickname, vendor: a.vendor }))
        };

        sendSSE(res, 'queue', queueData);

        const { daysBack = 30 } = req.body;
        const fetchCategoriesSetting = await getFetchCategoriesSetting(client);
        const updateCategoryOnRescrape = await getUpdateCategoryOnRescrapeSetting(client);
        const logHttpRequests = await getLogHttpRequestsSetting(client);
        const categorizationRules = await loadCategorizationRules(client);
        const categoryMappings = await loadCategoryMappings(client);
        const billingCycleStartDay = await getBillingCycleStartDay(client);
        const maxRetries = await getScrapeRetries(client);

        logger.info({ maxRetries }, '[Sync All Stream] Retry settings loaded');

        // 2. Loop through accounts
        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            sendSSE(res, 'account_start', {
                index: i,
                id: account.id,
                nickname: account.nickname
            });

            const scraperCredentials = prepareCredentials(account.vendor, account.credentials);
            const timeoutSetting = await getScraperTimeout(client, account.vendor);

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysBack);

            const scraperOptions = {
                ...getScraperOptions(account.vendor, startDate, {
                    timeout: timeoutSetting,
                    showBrowser: false,
                    fetchCategories: fetchCategoriesSetting,
                }),
                logRequests: logHttpRequests,
            };

            const auditId = await insertScrapeAudit(client, 'sync-all-stream', account.vendor, startDate);

            // Retry loop for this account
            let accountResult = null;
            let lastError = null;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    if (attempt > 0) {
                        // Calculate exponential backoff: 5s, 10s, 20s, etc.
                        const retryDelay = Math.min(5000 * Math.pow(2, attempt - 1), 60000);
                        logger.info({
                            vendor: account.vendor,
                            attempt,
                            maxRetries,
                            retryDelay,
                            previousError: lastError
                        }, '[Sync All Stream] Retrying account scrape after delay');

                        await updateScrapeAudit(client, auditId, 'started', `Retry attempt ${attempt}/${maxRetries} after ${retryDelay}ms`);
                        sendSSE(res, 'progress', {
                            accountId: account.id,
                            type: 'retryWait',
                            message: `Retrying in ${retryDelay / 1000}s (attempt ${attempt}/${maxRetries})...`,
                            seconds: retryDelay / 1000
                        });
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }

                    const progressHandler = (vendor, payload) => {
                        sendSSE(res, 'progress', {
                            accountId: account.id,
                            vendor: vendor,
                            ...payload
                        });
                    };

                    const result = await runScraper(client, scraperOptions, scraperCredentials, progressHandler, () => false);

                    if (!result.success) {
                        throw new Error(result.errorMessage || 'Scraper failed');
                    }

                    const isBank = BANK_VENDORS.includes(account.vendor);

                    const stats = await processScrapedAccounts({
                        client,
                        accounts: result.accounts,
                        companyId: account.vendor,
                        credentialId: account.id,
                        categorizationRules,
                        categoryMappings,
                        billingCycleStartDay,
                        updateCategoryOnRescrape,
                        isBank,
                        onTransactionProcessed: () => true,
                    });

                    await updateScrapeAudit(client, auditId, 'success', `Synced ${stats.savedTransactions} txns`, stats);
                    await updateCredentialLastSynced(client, account.id);

                    sendSSE(res, 'account_complete', {
                        id: account.id,
                        summary: stats,
                        retriedAttempts: attempt
                    });

                    accountResult = { success: true, stats };
                    break; // Success - exit retry loop

                } catch (scrapeError) {
                    lastError = scrapeError.message || 'Unknown error';

                    if (attempt < maxRetries) {
                        logger.warn({
                            vendor: account.vendor,
                            attempt,
                            maxRetries,
                            error: lastError
                        }, '[Sync All Stream] Account scrape failed, will retry');
                        continue; // Retry
                    } else {
                        // Final attempt failed
                        logger.error({ vendor: account.vendor, error: lastError }, '[Sync All Stream] Account sync failed after all retries');
                        if (auditId) {
                            await updateScrapeAudit(client, auditId, 'failed', lastError);
                        }
                        sendSSE(res, 'account_error', {
                            id: account.id,
                            message: lastError,
                            retriedAttempts: attempt
                        });
                        accountResult = { success: false, error: lastError };
                        break;
                    }
                }
            }
            // Continue to next account
        }

        sendSSE(res, 'complete', {
            message: '✓ All accounts synced successfully',
            durationSeconds: Math.floor((Date.now() - startTime) / 1000)
        });

    } catch (error) {
        logger.error({ error: error.message }, '[Sync All Stream] Fatal error');
        sendSSE(res, 'error', { message: error.message });
    } finally {
        if (client) client.release();
        if (!res.finished) res.end();
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '1mb',
        },
        responseLimit: false,
    },
};
