import { createScraper } from 'israeli-bank-scrapers';
import { getPreparePage, RATE_LIMITED_VENDORS } from './core.js';
import logger from '../utils/logger.js';

/**
 * Isolated Scraper Runner
 * This script is intended to be run as a child process (via child_process.fork).
 * It communicates with the parent process via IPC.
 */

async function run() {
    logger.info('[Runner] Worker process started');
    
    // Signal that the runner is ready immediately
    try {
        process.send({ type: 'ready' });
        logger.info('[Runner] Sent ready signal to parent');
    } catch (err) {
        logger.error({ error: err.message }, '[Runner] Failed to send ready signal');
    }

    process.on('message', async (message) => {
        logger.debug({ action: message.action }, '[Runner] Received message');
        const { action, scraperOptions, credentials } = message;

        if (action === 'scrape') {
            try {
                logger.info({ companyId: scraperOptions.companyId, credentialKeys: Object.keys(credentials || {}) }, '[Runner] Starting scrape');
                
                // Step 1: Fix non-serializable options
                // Date becomes string during IPC
                const startDate = new Date(scraperOptions.startDate);
                logger.info({ startDate: startDate.toISOString() }, '[Runner] Start date');

                // Add non-serializable options like preparePage
                const isRateLimited = RATE_LIMITED_VENDORS.includes(scraperOptions.companyId);
                logger.info({ isRateLimited }, '[Runner] Rate limit status');
                
                const options = {
                    ...scraperOptions,
                    startDate,
                    preparePage: getPreparePage(isRateLimited)
                };

                logger.info('[Runner] Creating scraper instance');
                const scraper = createScraper(options);
                logger.info('[Runner] Scraper instance created');

                // Listen for internal scraper events and forward them to parent
                // Check if .on exists as some versions/environments might differ
                if (scraper && typeof scraper.on === 'function') {
                    logger.info('[Runner] Setting up progress listener');
                    scraper.on('progress', (companyId, progress) => {
                        logger.debug({ companyId, progressType: progress?.type || 'unknown' }, '[Runner] Progress event');
                        try {
                            process.send({ type: 'progress', companyId, progress });
                        } catch (err) {
                            logger.error({ error: err.message }, '[Runner] Failed to send progress');
                        }
                    });
                } else {
                    logger.warn({ companyId: scraperOptions.companyId }, '[Runner] Scraper instance does not support progress events');
                }

                logger.info('[Runner] Starting scrape');
                let result;
                try {
                    result = await scraper.scrape(credentials);
                    logger.info({ success: result?.success }, '[Runner] Scrape completed');
                } catch (scrapeErr) {
                    // Catch errors thrown directly by scraper.scrape()
                    logger.error({ 
                        error: scrapeErr.message, 
                        stack: scrapeErr.stack,
                        name: scrapeErr.name 
                    }, '[Runner] Scraper threw exception during scrape()');
                    throw scrapeErr; // Re-throw to be caught by outer catch
                }

                // Validate and sanitize result structure before sending
                if (result && typeof result === 'object') {
                    // Deep clone and sanitize result to ensure it's serializable
                    const sanitizedResult = {
                        success: result.success || false,
                        errorType: result.errorType || null,
                        errorMessage: result.errorMessage || null,
                        accounts: null
                    };

                    if (result.success && result.accounts) {
                        // Ensure accounts is an array
                        if (!Array.isArray(result.accounts)) {
                            logger.warn({ 
                                accountsType: typeof result.accounts,
                                accountsValue: result.accounts
                            }, '[Runner] result.accounts is not an array, converting');
                            sanitizedResult.accounts = [];
                        } else {
                            // Sanitize each account
                            sanitizedResult.accounts = result.accounts.map(account => {
                                if (!account || typeof account !== 'object') {
                                    logger.warn({ account }, '[Runner] Invalid account object, skipping');
                                    return null;
                                }
                                
                                const sanitizedAccount = {
                                    accountNumber: account.accountNumber || null,
                                    txns: []
                                };

                                // Ensure txns is an array
                                if (Array.isArray(account.txns)) {
                                    sanitizedAccount.txns = account.txns.map(txn => {
                                        // Ensure transaction is a plain object
                                        if (txn && typeof txn === 'object') {
                                            return {
                                                date: txn.date || null,
                                                processedDate: txn.processedDate || null,
                                                originalAmount: txn.originalAmount || null,
                                                originalCurrency: txn.originalCurrency || null,
                                                chargedAmount: txn.chargedAmount || null,
                                                description: txn.description || null,
                                                memo: txn.memo || null,
                                                status: txn.status || null,
                                                identifier: txn.identifier || null,
                                                type: txn.type || null,
                                                installmentsNumber: txn.installmentsNumber || null,
                                                installmentsTotal: txn.installmentsTotal || null,
                                                category: txn.category || null
                                            };
                                        }
                                        logger.warn({ txn }, '[Runner] Invalid transaction object, skipping');
                                        return null;
                                    }).filter(t => t !== null);
                                } else {
                                    logger.warn({ 
                                        accountNumber: account.accountNumber,
                                        txnsType: typeof account.txns,
                                        txnsValue: account.txns
                                    }, '[Runner] Account txns is not an array, setting to empty array');
                                }

                                return sanitizedAccount;
                            }).filter(a => a !== null);
                        }
                    }

                    if (sanitizedResult.success) {
                        logger.info({ accountCount: sanitizedResult.accounts?.length || 0 }, '[Runner] Sending success result');
                        try {
                            process.send({ type: 'success', result: sanitizedResult });
                        } catch (sendErr) {
                            logger.error({ error: sendErr.message }, '[Runner] Failed to send success result via IPC');
                            // Fallback: send error instead
                            process.send({ 
                                type: 'error', 
                                error: 'SERIALIZATION_ERROR',
                                errorMessage: `Failed to serialize result: ${sendErr.message}`
                            });
                        }
                    } else {
                        logger.error({ errorType: sanitizedResult.errorType, errorMessage: sanitizedResult.errorMessage }, '[Runner] Scrape failed');
                        process.send({ type: 'error', error: sanitizedResult.errorType || 'UNKNOWN', errorMessage: sanitizedResult.errorMessage || 'Scraping failed' });
                    }
                } else {
                    logger.error({ resultType: typeof result, result }, '[Runner] Invalid result structure');
                    process.send({ 
                        type: 'error', 
                        error: 'INVALID_RESULT',
                        errorMessage: 'Scraper returned invalid result structure'
                    });
                }
            } catch (err) {
                // Enhanced error logging for "text is not iterable" and similar issues
                const errorDetails = {
                    message: err.message || String(err),
                    name: err.name,
                    stack: err.stack ? err.stack.split('\n').slice(0, 10).join('\n') : undefined, // Limit stack trace length
                    vendor: scraperOptions?.companyId,
                    // Check if error is related to iteration
                    isIterationError: err.message?.includes('not iterable') || err.message?.includes('is not iterable')
                };
                
                logger.error(errorDetails, '[Runner] Fatal error during scrape');
                
                // Provide helpful hint for iteration errors
                let errorMessage = err.message || String(err);
                let hint = undefined;
                
                if (errorDetails.isIterationError) {
                    hint = 'The scraper library received unexpected data format from the bank. This may be due to website changes or temporary issues. Try again later or enable Debug Mode to see what\'s happening.';
                    errorMessage = `Data format error: ${errorMessage}. This usually means the bank website returned data in an unexpected format.`;
                }
                
                // Ensure error message is serializable (no circular refs, functions, etc.)
                const sanitizedError = {
                    type: 'error',
                    errorMessage: String(errorMessage).substring(0, 500), // Limit length
                    hint: hint ? String(hint).substring(0, 500) : undefined,
                    error: 'EXCEPTION'
                };
                
                try {
                    process.send(sanitizedError);
                } catch (sendErr) {
                    logger.error({ error: sendErr.message }, '[Runner] Failed to send error message via IPC');
                    // Last resort: try sending minimal error
                    try {
                        process.send({ 
                            type: 'error', 
                            errorMessage: 'An error occurred during scraping',
                            error: 'EXCEPTION'
                        });
                    } catch (finalErr) {
                        logger.error({ error: finalErr.message }, '[Runner] Completely failed to send error message');
                    }
                }
            } finally {
                // We don't exit here because the parent might want to keep the process alive 
                // for a bit or handle the exit itself.
            }
        }
    });
}

run().catch(err => {
    logger.error({ error: err.message, stack: err.stack }, '[Runner] Startup error');
    process.exit(1);
});
