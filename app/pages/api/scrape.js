import { getDB } from './db';
import { BANK_VENDORS } from '../../utils/constants';
import logger from '../../utils/logger.js';
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
  runScraper,
  loadCategorizationRules,
  loadCategoryMappings,
  getUpdateCategoryOnRescrapeSetting,
  getLogHttpRequestsSetting,
  getBillingCycleStartDay,
  processScrapedAccounts,
} from './utils/scraperUtils';

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
        showBrowser: false,
        fetchCategories: fetchCategoriesSetting,
        timeout: timeoutSetting,
      }),
      logRequests: await getLogHttpRequestsSetting(client),
    };

    // Insert audit row
    const triggeredBy = credentials?.username || credentials?.id || credentials?.nickname || 'unknown';
    auditId = await insertScrapeAudit(client, triggeredBy, options.companyId, new Date(options.startDate));

    let result;
    try {
      logger.info({ companyId: options.companyId, fetchCategories: fetchCategoriesSetting }, '[Scraper Handler] Starting scrape');

      const onProgress = (type, data) => {
        logger.info({ ...data, vendor: options.companyId }, `[Scraper Progress] ${data.message || data.type}`);
      };

      result = await runScraper(client, scraperOptions, scraperCredentials, onProgress);

    } catch (scrapeError) {
      const errorMessage = scrapeError.message || 'Scraper exception';
      await updateScrapeAudit(client, auditId, 'failed', errorMessage);

      // Handle common scraper errors
      if (errorMessage.includes('JSON') || errorMessage.includes('Unexpected end of JSON') || errorMessage.includes('invalid json') || errorMessage.includes('GetFrameStatus') || errorMessage.includes('frame') || errorMessage.includes('timeout')) {
        if (options.companyId === 'visaCal') {
          throw new Error(`VisaCal API Error: The Cal website returned an invalid response. This may be due to temporary service issues or website changes. Try again in a few minutes. Error: ${errorMessage}`);
        }
        throw new Error(`API Error: Invalid response from ${options.companyId}. Try again later. Error: ${errorMessage}`);
      }

      throw new Error(errorMessage);
    }

    if (!result.success) {
      const errorType = result.errorType || 'GENERIC';
      const errorMsg = result.errorMessage || errorType || 'Scraping failed';
      await updateScrapeAudit(client, auditId, 'failed', errorMsg);

      // Handle JSON parsing errors (common with VisaCal API)
      if (errorMsg.includes('JSON') || errorMsg.includes('Unexpected end of JSON') || errorMsg.includes('invalid json') || errorMsg.includes('GetFrameStatus') || errorMsg.includes('frame') || errorMsg.includes('timeout')) {
        if (options.companyId === 'visaCal') {
          throw new Error(`VisaCal API Error: The Cal website returned an invalid response (${errorMsg}). This may be due to temporary service issues, rate limiting, or website changes. Please try again in a few minutes.`);
        }
        throw new Error(`API Error: Invalid JSON response from ${options.companyId} (${errorMsg}). This may be a temporary issue. Please try again later.`);
      }

      throw new Error(`${errorType}: ${errorMsg}`);
    }

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
    await updateScrapeAudit(client, auditId, 'success', `Success: accounts=${stats.accounts}, saved=${stats.savedTransactions}, updated=${stats.updatedTransactions}`);

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
