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
                const result = await scraper.scrape(credentials);
                logger.info({ success: result.success }, '[Runner] Scrape completed');

                if (result.success) {
                    logger.info('[Runner] Sending success result');
                    process.send({ type: 'success', result });
                } else {
                    logger.error({ errorType: result.errorType, errorMessage: result.errorMessage }, '[Runner] Scrape failed');
                    process.send({ type: 'error', error: result.errorType, errorMessage: result.errorMessage });
                }
            } catch (err) {
                logger.error({ error: err.message, stack: err.stack }, '[Runner] Fatal error during scrape');
                try {
                    process.send({ type: 'error', errorMessage: err.message || String(err), error: 'EXCEPTION' });
                } catch (sendErr) {
                    logger.error({ error: sendErr.message }, '[Runner] Failed to send error message');
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
