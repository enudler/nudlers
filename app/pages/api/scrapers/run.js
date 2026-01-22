import { getDB } from '../db';
import { BANK_VENDORS } from '../../../utils/constants';
import logger from '../../../utils/logger.js';
import {
  loadCategoryCache,
  lookupCachedCategory,
  insertTransaction,
  checkCardOwnership,
  claimCardOwnership,
  prepareCredentials,
  validateCredentials,
  getScraperOptions,
  getPreparePage,
  insertScrapeAudit,
  updateScrapeAudit,
  updateCredentialLastSynced,

  getFetchCategoriesSetting,
  getScraperTimeout,
  getScrapeRetries,
  runScraper,
  loadCategorizationRules,
  loadCategoryMappings,
  getUpdateCategoryOnRescrapeSetting,
  getLogHttpRequestsSetting,
  getBillingCycleStartDay,
  processScrapedAccounts,
  checkScraperConcurrency,
} from '../utils/scraperUtils';

const CompanyTypes = {
  hapoalim: 'hapoalim',
  leumi: 'leumi',
  discount: 'discount',
  otsarHahayal: 'otsarHahayal',
  mercantile: 'mercantile',
  mizrahi: 'mizrahi',
  igud: 'igud',
  massad: 'massad',
  yahav: 'yahav',
  beinleumi: 'beinleumi',
  isracard: 'isracard',
  amex: 'amex',
  max: 'max',
  visaCal: 'visaCal',
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const client = await getDB();
  const startTime = new Date();
  let auditId = null;

  try {
    // Check for other running scrapers
    try {
      await checkScraperConcurrency(client);
    } catch (concurrencyError) {
      logger.warn({ error: concurrencyError.message }, '[Scrape] Concurrency check failed');
      return res.status(409).json({
        message: concurrencyError.message,
        error: 'Scraper already running',
        type: 'CONCURRENCY_ERROR'
      });
    }

    const { options, credentials, credentialId } = req.body;
    const companyId = CompanyTypes[options.companyId];
    if (!companyId) {
      throw new Error('Invalid company ID');
    }

    const isBank = BANK_VENDORS.includes(options.companyId);

    // Prepare and validate credentials
    const scraperCredentials = prepareCredentials(options.companyId, credentials);
    validateCredentials(scraperCredentials, options.companyId);


    // Get category fetching setting - disabling helps avoid rate limiting
    const fetchCategoriesSetting = await getFetchCategoriesSetting(client);
    logger.info({ fetchCategories: fetchCategoriesSetting }, '[Scraper] Fetch categories setting');

    // Get timeout settings
    const timeoutSetting = await getScraperTimeout(client, companyId);

    const scraperOptions = {
      ...getScraperOptions(companyId, new Date(options.startDate), {
        showBrowser: options.showBrowser || false,
        fetchCategories: fetchCategoriesSetting,
        timeout: timeoutSetting,
      }),
      logRequests: await getLogHttpRequestsSetting(client),
    };

    // Insert audit row
    const triggeredBy = credentials?.username || credentials?.id || credentials?.nickname || 'unknown';
    auditId = await insertScrapeAudit(client, triggeredBy, options.companyId, new Date(options.startDate));

    // Get retry settings
    const maxRetries = await getScrapeRetries(client);
    logger.info({ maxRetries }, '[Scraper Handler] Retry settings loaded');

    let result;
    let lastError = null;
    let attempt = 0;

    // Retry loop
    for (attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Calculate exponential backoff: 5s, 10s, 20s, etc.
          const retryDelay = Math.min(5000 * Math.pow(2, attempt - 1), 60000);
          logger.info({
            attempt,
            maxRetries,
            retryDelay,
            previousError: lastError
          }, '[Scraper Handler] Retrying scrape after delay');

          await updateScrapeAudit(client, auditId, 'started', `Retry attempt ${attempt}/${maxRetries} after ${retryDelay}ms`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          logger.info({ companyId: options.companyId, fetchCategories: fetchCategoriesSetting }, '[Scraper Handler] Starting scrape');
        }

        const onProgress = (type, data) => {
          logger.info({ ...data, vendor: options.companyId }, `[Scraper Progress] ${data.message || data.type}`);
        };

        result = await runScraper(client, scraperOptions, scraperCredentials, onProgress);

        // Success - break out of retry loop
        if (result.success) {
          if (attempt > 0) {
            logger.info({ attempt }, '[Scraper Handler] Scrape succeeded after retry');
          }
          break;
        } else {
          // Scraper returned unsuccessful result - treat as error for retry
          const errorType = result.errorType || 'GENERIC';
          const errorMsg = result.errorMessage || errorType || 'Scraping failed';
          lastError = errorMsg;

          if (attempt < maxRetries) {
            logger.warn({ attempt, maxRetries, error: errorMsg }, '[Scraper Handler] Scrape unsuccessful, will retry');
            continue;
          } else {
            // Final attempt failed
            throw new Error(`${errorType}: ${errorMsg}`);
          }
        }

      } catch (scrapeError) {
        lastError = scrapeError.message || 'Scraper exception';

        if (attempt < maxRetries) {
          logger.warn({
            attempt,
            maxRetries,
            error: lastError
          }, '[Scraper Handler] Scrape failed, will retry');
          continue;
        } else {
          // Final attempt - update audit and throw
          await updateScrapeAudit(client, auditId, 'failed', lastError);

          // Handle common scraper errors
          if (lastError.includes('JSON') || lastError.includes('Unexpected end of JSON') || lastError.includes('invalid json') || lastError.includes('GetFrameStatus') || lastError.includes('frame') || lastError.includes('timeout')) {
            if (options.companyId === 'visaCal') {
              throw new Error(`VisaCal API Error: The Cal website returned an invalid response. This may be due to temporary service issues or website changes. Try again in a few minutes. Error: ${lastError}`);
            }
            throw new Error(`API Error: Invalid response from ${options.companyId}. Try again later. Error: ${lastError}`);
          }

          throw new Error(lastError);
        }
      }
    }

    // At this point, result should be successful (otherwise we would have thrown in the retry loop)
    if (!result) {
      throw new Error('[Scraper Handler] Unexpected error: result is undefined after retry loop');
    }


    // Load rules and settings for processing
    const categorizationRules = await loadCategorizationRules(client);
    const categoryMappings = await loadCategoryMappings(client);
    const billingCycleStartDay = await getBillingCycleStartDay(client);
    const updateCategoryOnRescrape = await getUpdateCategoryOnRescrapeSetting(client);

    // Process transactions and save to database using consolidated helper
    const stats = await processScrapedAccounts({
      client,
      accounts: result.accounts,
      companyId: options.companyId,
      credentialId,
      categorizationRules,
      categoryMappings,
      billingCycleStartDay,
      updateCategoryOnRescrape,
      isBank
    });

    if (stats.cachedCategories > 0) {
      logger.info({ count: stats.cachedCategories }, '[Category Cache] Applied cached categories to transactions');
    }
    if (stats.skippedCards > 0) {
      logger.info({ skippedCards: stats.skippedCards }, '[Card Ownership] Skipped cards owned by other credentials');
    }

    // Update audit as success
    await updateScrapeAudit(client, auditId, 'success', `Success: accounts=${stats.accounts}, saved=${stats.savedTransactions}, updated=${stats.updatedTransactions}`, stats);

    // Update last_synced_at
    await updateCredentialLastSynced(client, credentialId);

    // Calculate duration
    const endTime = new Date();
    const durationSeconds = (endTime - startTime) / 1000;
    const durationFormatted = `${Math.floor(durationSeconds / 60)}m ${Math.floor(durationSeconds % 60)}s`;

    logger.info({
      durationSeconds,
      durationFormatted,
      accounts: result.accounts?.length
    }, '[Scraper Handler] Scraping completed');

    res.status(200).json({
      message: `Scraping completed successfully in ${durationFormatted}`,
      accounts: result.accounts,
      duration: durationFormatted,
      durationSeconds
    });
  } catch (error) {
    const endTime = new Date();
    const durationSeconds = (endTime - startTime) / 1000;

    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationSeconds
    }, 'Scraping failed');

    if (auditId) {
      try {
        await updateScrapeAudit(client, auditId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      } catch (e) {
        // noop - avoid masking original error
      }
    }

    res.status(500).json({
      message: 'Scraping failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      durationSeconds
    });
  } finally {
    client.release();
  }
}

export default handler;
