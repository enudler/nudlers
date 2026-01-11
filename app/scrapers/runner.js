import { createScraper } from 'israeli-bank-scrapers';
import { getPreparePage, RATE_LIMITED_VENDORS } from './core.js';

/**
 * Isolated Scraper Runner
 * This script is intended to be run as a child process (via child_process.fork).
 * It communicates with the parent process via IPC.
 */

async function run() {
    process.on('message', async (message) => {
        const { action, scraperOptions, credentials } = message;

        if (action === 'scrape') {
            try {
                // Step 1: Fix non-serializable options
                // Date becomes string during IPC
                const startDate = new Date(scraperOptions.startDate);

                // Add non-serializable options like preparePage
                const isRateLimited = RATE_LIMITED_VENDORS.includes(scraperOptions.companyId);
                const options = {
                    ...scraperOptions,
                    startDate,
                    preparePage: getPreparePage(isRateLimited)
                };

                console.log(`[Runner] Initializing scraper for ${scraperOptions.companyId} (startDate: ${startDate.toISOString()})...`);
                const scraper = createScraper(options);

                // Listen for internal scraper events and forward them to parent
                // Check if .on exists as some versions/environments might differ
                if (scraper && typeof scraper.on === 'function') {
                    scraper.on('progress', (companyId, progress) => {
                        process.send({ type: 'progress', companyId, progress });
                    });
                } else {
                    console.warn(`[Runner] Scraper instance for ${scraperOptions.companyId} does not support .on('progress')`);
                }

                const result = await scraper.scrape(credentials);

                if (result.success) {
                    process.send({ type: 'success', result });
                } else {
                    process.send({ type: 'error', error: result.errorType, errorMessage: result.errorMessage });
                }
            } catch (err) {
                console.error('[Runner] Fatal error during scrape:', err);
                process.send({ type: 'error', errorMessage: err.message });
            } finally {
                // We don't exit here because the parent might want to keep the process alive 
                // for a bit or handle the exit itself.
            }
        }
    });

    // Signal that the runner is ready
    process.send({ type: 'ready' });
}

run().catch(err => {
    console.error('[Runner] Startup error:', err);
    process.exit(1);
});
