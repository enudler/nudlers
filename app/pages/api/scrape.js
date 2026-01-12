import { getDB } from './db';
import { BANK_VENDORS } from '../../utils/constants';
import logger from '../../utils/logger.js';
import {
  RATE_LIMITED_VENDORS,
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
  getShowBrowserSetting,
  getFetchCategoriesSetting,
  getStandardTimeoutSetting,
  getRateLimitedTimeoutSetting,
  retryWithBackoff,
  sleep,
  runScraper,
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
  let auditId = null;

  try {
    const { options, credentials, credentialId } = req.body;
    const companyId = CompanyTypes[options.companyId];
    if (!companyId) {
      throw new Error('Invalid company ID');
    }

    const isBank = BANK_VENDORS.includes(options.companyId);
    const isIsracardAmex = RATE_LIMITED_VENDORS.includes(options.companyId);
    const isVisaCal = options.companyId === 'visaCal';

    // Prepare and validate credentials
    const scraperCredentials = prepareCredentials(options.companyId, credentials);
    validateCredentials(scraperCredentials, options.companyId);

    // Get settings from database (unless explicitly overridden)
    const showBrowserSetting = options.showBrowser !== undefined
      ? options.showBrowser
      : await getShowBrowserSetting(client);

    // Get category fetching setting - disabling helps avoid rate limiting
    const fetchCategoriesSetting = await getFetchCategoriesSetting(client);
    logger.info({ fetchCategories: fetchCategoriesSetting }, '[Scraper] Fetch categories setting');

    // For rate-limited vendors (VisaCal, Isracard/Amex/Max), add a pre-scrape delay to avoid rate limiting
    if (isIsracardAmex || isVisaCal) {
      // VisaCal needs longer delays due to API rate limiting
      const preDelay = isVisaCal
        ? Math.floor(Math.random() * 10000) + 5000 // 5-15 seconds for VisaCal
        : Math.floor(Math.random() * 5000) + 3000;  // 3-8 seconds for others
      logger.info({ vendor: options.companyId, delaySeconds: Math.round(preDelay / 1000) }, '[Scraper] Rate-limited vendor detected, adding pre-scrape delay');
      await sleep(preDelay);
    }

    // Get timeout settings - VisaCal and other rate-limited vendors need longer timeouts
    const timeoutSetting = (isIsracardAmex || isVisaCal)
      ? await getRateLimitedTimeoutSetting(client)
      : await getStandardTimeoutSetting(client);

    // Build scraper options with anti-detection measures
    // Pass isIsracardAmex flag (which now includes VisaCal) for proper handling
    const scraperOptions = {
      ...getScraperOptions(companyId, new Date(options.startDate), isIsracardAmex || isVisaCal, {
        showBrowser: showBrowserSetting,
        fetchCategories: fetchCategoriesSetting,
        timeout: timeoutSetting,
      }),
      // Note: preparePage can't be passed to worker as it's a function
      // We'll handle it inside the runner or passed as a flag
    };

    // Insert audit row
    const triggeredBy = credentials?.username || credentials?.id || credentials?.nickname || 'unknown';
    auditId = await insertScrapeAudit(client, triggeredBy, options.companyId, new Date(options.startDate));

    // Execute scraping with retry for VisaCal/Cal (which has intermittent JSON parsing errors)
    const maxRetries = isVisaCal ? 3 : 0; // Increased from 2 to 3 for better reliability
    const retryBaseDelay = isVisaCal ? 10000 : 5000; // Longer delays for VisaCal (10s base)

    let result;
    try {
      result = await retryWithBackoff(
        async () => {
          return await runScraper(scraperOptions, scraperCredentials);
        },
        maxRetries,
        retryBaseDelay,
        options.companyId
      );
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
          throw new Error(`VisaCal API Error: The Cal website returned an invalid response (${errorMsg}). This may be due to temporary service issues, rate limiting, or website changes. Please try again in a few minutes. If the problem persists, try enabling "Show Browser" mode for debugging.`);
        }
        throw new Error(`API Error: Invalid JSON response from ${options.companyId} (${errorMsg}). This may be a temporary issue. Please try again later.`);
      }

      throw new Error(`${errorType}: ${errorMsg}`);
    }

    // Load category cache and process transactions
    const cache = await loadCategoryCache(client);

    let bankTransactions = 0;
    let cachedCategoryCount = 0;
    let skippedCards = 0;

    for (const account of result.accounts) {
      // Check card ownership
      const ownedByOther = await checkCardOwnership(client, account.accountNumber, options.companyId, credentialId);

      if (ownedByOther) {
        logger.info({ accountNumber: account.accountNumber, ownedBy: ownedByOther }, '[Card Ownership] Skipping card - already owned by another credential');
        skippedCards++;
        continue;
      }

      // Claim ownership
      await claimCardOwnership(client, account.accountNumber, options.companyId, credentialId);

      // Defensive check: ensure txns is an array
      if (!account.txns || !Array.isArray(account.txns)) {
        logger.warn({
          accountNumber: account.accountNumber,
          txnsType: typeof account.txns,
          txnsValue: account.txns,
          accountKeys: Object.keys(account || {})
        }, '[Scrape] Account txns is not an array, skipping transactions');
        continue;
      }

      for (const txn of account.txns) {
        if (isBank) bankTransactions++;

        const hadCategory = txn.category && txn.category !== 'N/A';
        const defaultCurrency = txn.originalCurrency || txn.chargedCurrency || 'ILS';
        await insertTransaction(client, txn, options.companyId, account.accountNumber, defaultCurrency);
        if (!hadCategory && lookupCachedCategory(txn.description, cache)) {
          cachedCategoryCount++;
        }
      }
    }

    if (cachedCategoryCount > 0) {
      logger.info({ count: cachedCategoryCount }, '[Category Cache] Applied cached categories to transactions');
    }
    if (skippedCards > 0) {
      logger.info({ skippedCards }, '[Card Ownership] Skipped cards owned by other credentials');
    }

    // Update audit as success
    const accountsCount = Array.isArray(result.accounts) ? result.accounts.length : 0;
    await updateScrapeAudit(client, auditId, 'success', `Success: accounts=${accountsCount}, bankTxns=${bankTransactions}`);

    // Update last_synced_at
    await updateCredentialLastSynced(client, credentialId);

    res.status(200).json({
      message: 'Scraping and database update completed successfully',
      accounts: result.accounts
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, 'Scraping failed');

    if (auditId) {
      try {
        await updateScrapeAudit(client, auditId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      } catch (e) {
        // noop - avoid masking original error
      }
    }

    res.status(500).json({
      message: 'Scraping failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    client.release();
  }
}

export default handler;
