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

            try {
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
                    summary: stats
                });

            } catch (accountError) {
                logger.error({ vendor: account.vendor, error: accountError.message }, '[Sync All Stream] Account sync failed');
                if (auditId) {
                    await updateScrapeAudit(client, auditId, 'failed', accountError.message);
                }
                sendSSE(res, 'account_error', {
                    id: account.id,
                    message: accountError.message
                });
                // Continue to next account
            }
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
