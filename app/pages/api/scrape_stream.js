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

// Helper to send SSE messages
function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function handler(req, res) {
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
  let auditId = null;

  try {
    const { options, credentials, credentialId } = req.body;
    const companyId = CompanyTypes[options.companyId];

    if (!companyId) {
      sendSSE(res, 'error', { message: 'Invalid company ID' });
      res.end();
      return;
    }

    logger.info({ vendor: options.companyId, credentialId, startDate: options.startDate, showBrowser: options.showBrowser }, '[Scrape Stream] Starting scrape');

    sendSSE(res, 'progress', {
      step: 'init',
      message: `Initializing scraper for ${options.companyId}...`,
      percent: 0,
      phase: 'initialization',
      success: null
    });

    const isBank = BANK_VENDORS.includes(options.companyId);
    const isIsracardAmex = RATE_LIMITED_VENDORS.includes(options.companyId);
    const isVisaCal = options.companyId === 'visaCal';

    logger.info({ isBank, isIsracardAmex, isVisaCal }, '[Scrape Stream] Vendor type detection');

    // Prepare and validate credentials
    const scraperCredentials = prepareCredentials(options.companyId, credentials);

    // Log credential fields (masked) for debugging
    const maskedCreds = Object.fromEntries(
      Object.entries(scraperCredentials).map(([k, v]) => [
        k,
        v ? `${v.substring(0, 2)}***${v.substring(v.length - 2)} (${v.length} chars)` : 'EMPTY'
      ])
    );
    logger.info({ credentials: maskedCreds }, '[Scrape Stream] Prepared credentials');

    try {
      validateCredentials(scraperCredentials, options.companyId);
    } catch (error) {
      logger.error({ error: error.message }, '[Scrape Stream] Credential validation failed');
      sendSSE(res, 'error', { message: error.message });
      res.end();
      return;
    }

    // For rate-limited vendors (VisaCal, Isracard/Amex/Max), add a pre-scrape delay
    if (isIsracardAmex || isVisaCal) {
      // VisaCal needs longer delays due to API rate limiting
      const preDelay = isVisaCal
        ? Math.floor(Math.random() * 10000) + 5000 // 5-15 seconds for VisaCal
        : Math.floor(Math.random() * 5000) + 3000;  // 3-8 seconds for others

      sendSSE(res, 'progress', {
        step: 'rate_limit_delay',
        message: `Adding ${Math.round(preDelay / 1000)}s delay to avoid rate limiting...`,
        percent: 2,
        phase: 'initialization',
        success: null
      });
      await sleep(preDelay);
      sendSSE(res, 'progress', {
        step: 'rate_limit_delay',
        message: '✓ Delay completed',
        percent: 3,
        phase: 'initialization',
        success: true
      });
    }

    // Show date range being scraped
    const startDateStr = new Date(options.startDate).toLocaleDateString('en-GB');
    const todayStr = new Date().toLocaleDateString('en-GB');
    sendSSE(res, 'progress', {
      step: 'date_range',
      message: `📅 Scraping from ${startDateStr} to ${todayStr}`,
      percent: 4,
      phase: 'initialization',
      success: null
    });

    sendSSE(res, 'progress', {
      step: 'browser',
      message: 'Launching browser...',
      percent: 5,
      phase: 'initialization',
      success: null
    });

    // Get settings from database (unless explicitly overridden)
    const showBrowserSetting = options.showBrowser !== undefined
      ? options.showBrowser
      : await getShowBrowserSetting(client);

    // Get category fetching setting - disabling helps avoid rate limiting
    const fetchCategoriesSetting = await getFetchCategoriesSetting(client);
    logger.info({ fetchCategories: fetchCategoriesSetting }, '[Scrape Stream] Fetch categories setting');

    // Get timeout settings - VisaCal and other rate-limited vendors need longer timeouts
    const timeoutSetting = (isIsracardAmex || isVisaCal)
      ? await getRateLimitedTimeoutSetting(client)
      : await getStandardTimeoutSetting(client);

    // Build scraper options with progress callback
    // Pass isIsracardAmex flag (which now includes VisaCal) for proper handling
    const scraperOptions = {
      ...getScraperOptions(companyId, new Date(options.startDate), isIsracardAmex || isVisaCal, {
        timeout: timeoutSetting,
        defaultTimeout: timeoutSetting,
        showBrowser: showBrowserSetting,
        fetchCategories: fetchCategoriesSetting,
      })
    };

    // Track completed steps for better status reporting
    const completedSteps = new Set();

    const progressHandler = (companyId, payload) => {
      const stepMessages = {
        'initializing': {
          message: 'Initializing scraper...',
          percent: 5,
          phase: 'initialization',
          success: true
        },
        'startScraping': {
          message: 'Starting scrape process...',
          percent: 10,
          phase: 'initialization',
          success: true
        },
        'loginStarted': {
          message: 'Navigating to login page...',
          percent: 20,
          phase: 'authentication',
          success: null
        },
        'loginWaitingForOTP': {
          message: 'Waiting for OTP verification...',
          percent: 25,
          phase: 'authentication',
          success: null
        },
        'loginSuccess': {
          message: '✓ Login successful',
          percent: 35,
          phase: 'authentication',
          success: true
        },
        'loginFailed': {
          message: '✗ Login failed',
          percent: 35,
          phase: 'authentication',
          success: false
        },
        'changePassword': {
          message: 'Password change required',
          percent: 30,
          phase: 'authentication',
          success: false
        },
        'fetchingTransactions': {
          message: 'Fetching transactions from website...',
          percent: 45,
          phase: 'data_fetching',
          success: null
        },
        'gettingAccountDetails': {
          message: 'Retrieving account details...',
          percent: 50,
          phase: 'data_fetching',
          success: null
        },
        'accountDetailsReceived': {
          message: '✓ Account details received',
          percent: 55,
          phase: 'data_fetching',
          success: true
        },
        'processingAccount': {
          message: `Processing account ${payload?.accountNumber || ''}...`,
          percent: 60,
          phase: 'processing',
          success: null
        },
        'processingTransactions': {
          message: 'Processing transactions...',
          percent: 65,
          phase: 'processing',
          success: null
        },
        'endScraping': {
          message: '✓ Scraping completed',
          percent: 75,
          phase: 'processing',
          success: true
        }
      };

      const stepInfo = stepMessages[payload?.type] || {
        message: `${payload?.type || 'Processing'}...`,
        percent: 50,
        phase: 'processing',
        success: null
      };

      // Mark step as completed if it has a success status
      if (stepInfo.success !== null) {
        completedSteps.add(payload?.type);
      }

      sendSSE(res, 'progress', {
        step: payload?.type || 'unknown',
        message: stepInfo.message,
        percent: stepInfo.percent,
        phase: stepInfo.phase,
        success: stepInfo.success,
        completedSteps: Array.from(completedSteps),
        details: payload
      });
    };

    // Insert audit row
    const triggeredBy = credentials?.username || credentials?.id || credentials?.nickname || 'unknown';
    auditId = await insertScrapeAudit(client, triggeredBy, options.companyId, new Date(options.startDate));

    sendSSE(res, 'progress', {
      step: 'scraping',
      message: 'Connecting to bank/credit card website...',
      percent: 15,
      phase: 'initialization',
      success: null
    });

    logger.info('[Scrape Stream] Starting worker-based scrape');

    // Use retry logic for VisaCal with more retries and longer delays
    const maxRetries = isVisaCal ? 3 : 0; // Increased from 2 to 3 for better reliability
    const retryBaseDelay = isVisaCal ? 10000 : 5000; // Longer delays for VisaCal (10s base)
    let retryAttempt = 0;

    let result;
    try {
      result = await retryWithBackoff(
        async () => {
          retryAttempt++;
          if (retryAttempt > 1) {
            sendSSE(res, 'progress', {
              step: 'retry',
              message: `Retrying VisaCal scrape (attempt ${retryAttempt}/${maxRetries + 1})...`,
              percent: 22,
              phase: 'initialization',
              success: null
            });
          }
          return await runScraper(scraperOptions, scraperCredentials, progressHandler);
        },
        maxRetries,
        retryBaseDelay,
        options.companyId
      );
      logger.info({ success: result.success }, '[Scrape Stream] Scraper returned');
    } catch (scrapeError) {
      const errorDetails = {
        message: scrapeError.message,
        name: scrapeError.name,
        stack: scrapeError.stack?.split('\n').slice(0, 5).join('\n'),
      };
      logger.error({ error: errorDetails }, '[Scrape Stream] Scraper threw exception');
      await updateScrapeAudit(client, auditId, 'failed', scrapeError.message || 'Scraper exception');

      // Handle JSON parsing errors (common with VisaCal API)
      let errorMessage = scrapeError.message || 'Scraper exception';
      let hint = undefined;

      if (errorMessage.includes('JSON') || errorMessage.includes('Unexpected end of JSON') || errorMessage.includes('invalid json') || errorMessage.includes('GetFrameStatus') || errorMessage.includes('frame') || errorMessage.includes('timeout')) {
        if (options.companyId === 'visaCal') {
          errorMessage = `VisaCal API Error: The Cal website returned an invalid response. This may be due to temporary service issues, rate limiting, or website changes.`;
          hint = 'VisaCal is rate-limited. Try: 1) Disabling "Fetch Categories from Scrapers" in Settings, 2) Waiting 5-10 minutes between scrapes, 3) Enabling Debug Mode to see what\'s happening.';
        } else {
          errorMessage = `API Error: Invalid JSON response from ${options.companyId}. This may be a temporary issue. Please try again later.`;
          hint = 'Try disabling "Fetch Categories from Scrapers" in Settings to reduce API calls.';
        }
      } else if (isIsracardAmex || isVisaCal) {
        hint = 'Rate-limited vendors (VisaCal, Isracard, Amex) may be blocking automation. Try enabling Debug Mode (Show Browser) or disabling "Fetch Categories from Scrapers" in Settings.';
      }

      sendSSE(res, 'error', {
        message: errorMessage,
        hint: hint
      });
      res.end();
      return;
    }

    // Validate result structure
    if (!result || typeof result !== 'object') {
      const errorMsg = 'Invalid scraper result: result is not an object';
      logger.error({ resultType: typeof result, result }, '[Scrape Stream] Invalid scraper result structure');
      await updateScrapeAudit(client, auditId, 'failed', errorMsg);
      sendSSE(res, 'error', {
        message: errorMsg,
        hint: 'The scraper returned an invalid result structure. This may indicate a problem with the scraper library or bank website changes.'
      });
      res.end();
      return;
    }

    if (!result.success) {
      const errorMsg = result.errorMessage || result.errorType || 'Scraping failed';
      logger.error({ errorType: result.errorType, errorMessage: result.errorMessage }, '[Scrape Stream] Scraper failed');
      await updateScrapeAudit(client, auditId, 'failed', errorMsg);

      // Provide helpful hints for common errors
      let hint = undefined;
      let displayError = errorMsg;

      if (result.errorType === 'InvalidPassword') {
        hint = 'Check your credentials. For Isracard, you need ID number + card 6 digits + password. For VisaCal, you need username + password.';
      } else if (errorMsg.includes('JSON') || errorMsg.includes('Unexpected end of JSON') || errorMsg.includes('invalid json') || errorMsg.includes('GetFrameStatus') || errorMsg.includes('frame') || errorMsg.includes('timeout')) {
        if (options.companyId === 'visaCal') {
          displayError = `VisaCal API Error: The Cal website returned an invalid response (${errorMsg}). This may be due to temporary service issues, rate limiting, or website changes.`;
          hint = 'VisaCal is rate-limited. Try: 1) Disabling "Fetch Categories from Scrapers" in Settings, 2) Waiting 5-10 minutes between scrapes, 3) Enabling Debug Mode to see what\'s happening.';
        } else {
          displayError = `API Error: Invalid JSON response from ${options.companyId} (${errorMsg}). This may be a temporary issue. Please try again later.`;
        }
      } else if (result.errorType === 'ChangePassword') {
        hint = 'You need to log into the bank/card website and change your password first.';
      } else if (errorMsg.includes('Block') || errorMsg.includes('automation')) {
        hint = 'The site is blocking automation. Enable Debug Mode to see the browser and try manually.';
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        if (options.companyId === 'visaCal') {
          hint = 'VisaCal request timed out. This is common due to rate limiting. Try waiting 10+ minutes between scrapes or disabling "Fetch Categories from Scrapers".';
        } else {
          hint = 'The request timed out. The site may be slow or blocking. Try again with Debug Mode enabled.';
        }
      }

      sendSSE(res, 'error', {
        message: `${result.errorType || 'GENERIC'}: ${displayError}`,
        hint
      });
      res.end();
      return;
    }

    sendSSE(res, 'progress', {
      step: 'saving',
      message: 'Saving transactions to database...',
      percent: 80,
      phase: 'saving',
      success: null
    });

    let bankTransactions = 0;
    let totalTransactions = 0;
    let savedTransactions = 0;
    let duplicateTransactions = 0;

    sendSSE(res, 'progress', {
      step: 'loading_cache',
      message: 'Loading category cache...',
      percent: 80,
      phase: 'saving',
      success: null
    });

    const cache = await loadCategoryCache(client);
    let cachedCategoryCount = 0;
    let skippedCards = 0;

    sendSSE(res, 'progress', {
      step: 'loading_cache',
      message: '✓ Category cache loaded',
      percent: 82,
      phase: 'saving',
      success: true
    });

    // Validate accounts array exists and is an array
    if (!result.accounts || !Array.isArray(result.accounts)) {
      const errorMsg = `Invalid accounts structure: expected array, got ${typeof result.accounts}`;
      logger.error({
        accountsType: typeof result.accounts,
        accountsValue: result.accounts,
        resultKeys: Object.keys(result || {})
      }, '[Scrape Stream] Invalid accounts structure');
      await updateScrapeAudit(client, auditId, 'failed', errorMsg);
      sendSSE(res, 'error', {
        message: errorMsg,
        hint: 'The scraper returned accounts in an unexpected format. This may be due to website changes or temporary issues.'
      });
      res.end();
      return;
    }

    for (let i = 0; i < result.accounts.length; i++) {
      const account = result.accounts[i];

      sendSSE(res, 'progress', {
        step: 'processing_account',
        message: `Processing account ${i + 1}/${result.accounts.length} (${account.accountNumber || 'unknown'})...`,
        percent: 82 + (i * 5 / result.accounts.length),
        phase: 'saving',
        success: null
      });

      const ownedByOther = await checkCardOwnership(client, account.accountNumber, options.companyId, credentialId);

      if (ownedByOther) {
        logger.info({ accountNumber: account.accountNumber }, '[Card Ownership] Skipping card');
        sendSSE(res, 'progress', {
          step: 'skipping_card',
          message: `⏭ Skipping card ${account.accountNumber} (already synced by another account)`,
          percent: 82 + ((i + 1) * 5 / result.accounts.length),
          phase: 'saving',
          success: true
        });
        skippedCards++;
        continue;
      }

      await claimCardOwnership(client, account.accountNumber, options.companyId, credentialId);

      let accountSaved = 0;
      let accountDuplicates = 0;

      // Defensive check: ensure txns is an array
      if (!account.txns || !Array.isArray(account.txns)) {
        logger.warn({
          accountNumber: account.accountNumber,
          txnsType: typeof account.txns,
          txnsValue: account.txns,
          accountKeys: Object.keys(account || {})
        }, '[Scrape Stream] Account txns is not an array, skipping transactions');
        sendSSE(res, 'progress', {
          step: 'skipping_account',
          message: `⚠ Account ${account.accountNumber || 'unknown'} has invalid transaction data (txns is not an array)`,
          percent: 82 + ((i + 1) * 5 / result.accounts.length),
          phase: 'saving',
          success: false
        });
        continue;
      }

      for (const txn of account.txns) {
        totalTransactions++;
        if (isBank) bankTransactions++;
        const hadCategory = txn.category && txn.category !== 'N/A';
        const defaultCurrency = txn.originalCurrency || txn.chargedCurrency || 'ILS';
        const insertResult = await insertTransaction(client, txn, options.companyId, account.accountNumber, defaultCurrency);

        if (insertResult.duplicated) {
          duplicateTransactions++;
          accountDuplicates++;
        } else {
          savedTransactions++;
          accountSaved++;
        }

        if (!hadCategory && lookupCachedCategory(txn.description, cache)) {
          cachedCategoryCount++;
        }
      }

      sendSSE(res, 'progress', {
        step: 'account_saved',
        message: `✓ Account ${i + 1}/${result.accounts.length}: ${accountSaved} saved, ${accountDuplicates} duplicates`,
        percent: 82 + ((i + 1) * 5 / result.accounts.length),
        phase: 'saving',
        success: true
      });
    }

    // Update audit as success
    const accountsCount = Array.isArray(result.accounts) ? result.accounts.length : 0;
    await updateScrapeAudit(client, auditId, 'success', `Success: accounts=${accountsCount}, txns=${totalTransactions}, saved=${savedTransactions}, duplicates=${duplicateTransactions}`);

    // Update last_synced_at
    sendSSE(res, 'progress', {
      step: 'updating_timestamp',
      message: 'Updating last sync timestamp...',
      percent: 95,
      phase: 'saving',
      success: null
    });

    await updateCredentialLastSynced(client, credentialId);

    sendSSE(res, 'progress', {
      step: 'updating_timestamp',
      message: '✓ Timestamp updated',
      percent: 98,
      phase: 'saving',
      success: true
    });

    sendSSE(res, 'complete', {
      message: '✓ Scraping completed successfully!',
      percent: 100,
      summary: {
        accounts: result.accounts.length,
        transactions: totalTransactions,
        savedTransactions,
        duplicateTransactions,
        bankTransactions,
        cachedCategories: cachedCategoryCount,
        skippedCards
      }
    });

    res.end();
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, 'Scraping failed');
    if (auditId) {
      try {
        await updateScrapeAudit(client, auditId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      } catch (e) {
        // noop
      }
    }
    sendSSE(res, 'error', { message: error instanceof Error ? error.message : 'Unknown error' });
    res.end();
  } finally {
    client.release();
  }
}

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
};

export default handler;
