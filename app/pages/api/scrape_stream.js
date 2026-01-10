import { CompanyTypes, createScraper } from 'israeli-bank-scrapers';
import { getDB } from './db';
import { BANK_VENDORS } from '../../utils/constants';
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
  retryWithBackoff,
  sleep,
} from './utils/scraperUtils';

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

    console.log(`[Scrape Stream] Starting scrape for vendor: ${options.companyId}, credentialId: ${credentialId}`);
    console.log(`[Scrape Stream] Start date: ${options.startDate}, showBrowser: ${options.showBrowser}`);
    
    sendSSE(res, 'progress', { 
      step: 'init', 
      message: `Initializing scraper for ${options.companyId}...`,
      percent: 5
    });

    const isBank = BANK_VENDORS.includes(options.companyId);
    const isIsracardAmex = RATE_LIMITED_VENDORS.includes(options.companyId);
    
    console.log(`[Scrape Stream] isBank: ${isBank}, isIsracardAmex: ${isIsracardAmex}`);

    // Prepare and validate credentials
    const scraperCredentials = prepareCredentials(options.companyId, credentials);
    
    // Log credential fields (masked) for debugging
    const maskedCreds = Object.fromEntries(
      Object.entries(scraperCredentials).map(([k, v]) => [
        k, 
        v ? `${v.substring(0, 2)}***${v.substring(v.length - 2)} (${v.length} chars)` : 'EMPTY'
      ])
    );
    console.log(`[Scrape Stream] Prepared credentials:`, maskedCreds);
    
    try {
      validateCredentials(scraperCredentials, options.companyId);
    } catch (error) {
      console.error(`[Scrape Stream] Credential validation failed:`, error.message);
      sendSSE(res, 'error', { message: error.message });
      res.end();
      return;
    }

    // For rate-limited vendors (Isracard/Amex/Max/VisaCal), add a pre-scrape delay
    if (isIsracardAmex) {
      const preDelay = Math.floor(Math.random() * 5000) + 3000;
      sendSSE(res, 'progress', { 
        step: 'rate_limit_delay', 
        message: `Adding ${Math.round(preDelay/1000)}s delay to avoid rate limiting...`,
        percent: 8
      });
      await sleep(preDelay);
    }

    sendSSE(res, 'progress', { 
      step: 'browser', 
      message: 'Launching browser...',
      percent: 10
    });

    // Get settings from database (unless explicitly overridden)
    const showBrowserSetting = options.showBrowser !== undefined 
      ? options.showBrowser 
      : await getShowBrowserSetting(client);
    
    // Get category fetching setting - disabling helps avoid rate limiting
    const fetchCategoriesSetting = await getFetchCategoriesSetting(client);
    console.log(`[Scrape Stream] fetchCategories setting: ${fetchCategoriesSetting}`);

    // Build scraper options with progress callback
    // Pass showBrowser option from client (for debugging/2FA) or use setting
    const scraperOptions = {
      ...getScraperOptions(companyId, new Date(options.startDate), isIsracardAmex, {
        timeout: isIsracardAmex ? 240000 : 120000,
        defaultTimeout: isIsracardAmex ? 240000 : 120000,
        showBrowser: showBrowserSetting,
        fetchCategories: fetchCategoriesSetting,
      }),
      onProgress: (companyId, payload) => {
        const stepMessages = {
          'initializing': { message: 'Initializing...', percent: 15 },
          'startScraping': { message: 'Starting scrape process...', percent: 20 },
          'loginStarted': { message: 'Navigating to login page...', percent: 25 },
          'loginWaitingForOTP': { message: 'Waiting for OTP verification...', percent: 30 },
          'loginSuccess': { message: 'Login successful!', percent: 40 },
          'loginFailed': { message: 'Login failed', percent: 40 },
          'changePassword': { message: 'Password change required', percent: 35 },
          'fetchingTransactions': { message: 'Fetching transactions...', percent: 50 },
          'gettingAccountDetails': { message: 'Getting account details...', percent: 55 },
          'accountDetailsReceived': { message: 'Account details received', percent: 60 },
          'processingAccount': { message: `Processing account ${payload?.accountNumber || ''}...`, percent: 65 },
          'processingTransactions': { message: 'Processing transactions...', percent: 70 },
          'endScraping': { message: 'Finishing up...', percent: 85 }
        };
        
        const stepInfo = stepMessages[payload?.type] || { 
          message: `${payload?.type || 'Processing'}...`, 
          percent: 50 
        };
        
        sendSSE(res, 'progress', {
          step: payload?.type || 'unknown',
          message: stepInfo.message,
          percent: stepInfo.percent,
          details: payload
        });
      },
      preparePage: getPreparePage(isIsracardAmex),
    };

    const scraper = createScraper(scraperOptions);

    // Insert audit row
    const triggeredBy = credentials?.username || credentials?.id || credentials?.nickname || 'unknown';
    auditId = await insertScrapeAudit(client, triggeredBy, options.companyId, new Date(options.startDate));

    sendSSE(res, 'progress', { 
      step: 'scraping', 
      message: 'Connecting to bank/credit card website...',
      percent: 20
    });

    console.log(`[Scrape Stream] Starting scraper.scrape() call...`);
    
    // Use retry logic for VisaCal (which has intermittent JSON parsing errors)
    const isVisaCal = options.companyId === 'visaCal';
    const maxRetries = isVisaCal ? 2 : 0;
    let retryAttempt = 0;
    
    let result;
    try {
      result = await retryWithBackoff(
        async () => {
          retryAttempt++;
          if (retryAttempt > 1) {
            sendSSE(res, 'progress', {
              step: 'retry',
              message: `Retrying (attempt ${retryAttempt}/${maxRetries + 1})...`,
              percent: 22
            });
          }
          const scrapeResult = await scraper.scrape(scraperCredentials);
          // Also check for failure in result (not just thrown error)
          if (!scrapeResult.success) {
            const errorMsg = scrapeResult.errorMessage || scrapeResult.errorType || 'Scraping failed';
            // Throw retryable errors so they can be retried
            if (errorMsg.includes('JSON') || errorMsg.includes('Unexpected end of JSON') || 
                errorMsg.includes('GetFrameStatus') || errorMsg.includes('timeout')) {
              throw new Error(errorMsg);
            }
          }
          return scrapeResult;
        },
        maxRetries,
        5000,
        options.companyId
      );
      console.log(`[Scrape Stream] Scraper returned, success: ${result.success}`);
    } catch (scrapeError) {
      const errorDetails = {
        message: scrapeError.message,
        name: scrapeError.name,
        stack: scrapeError.stack?.split('\n').slice(0, 5).join('\n'),
      };
      console.error(`[Scrape Stream] Scraper threw exception:`, errorDetails);
      await updateScrapeAudit(client, auditId, 'failed', scrapeError.message || 'Scraper exception');
      
      // Handle JSON parsing errors (common with VisaCal API)
      let errorMessage = scrapeError.message || 'Scraper exception';
      let hint = undefined;
      
      if (errorMessage.includes('JSON') || errorMessage.includes('Unexpected end of JSON') || errorMessage.includes('invalid json') || errorMessage.includes('GetFrameStatus') || errorMessage.includes('frame') || errorMessage.includes('timeout')) {
        if (options.companyId === 'visaCal') {
          errorMessage = `VisaCal API Error: The Cal website returned an invalid response. This may be due to temporary service issues, rate limiting, or website changes. Please try again in a few minutes.`;
          hint = 'Try disabling "Fetch Categories from Scrapers" in Settings to reduce API calls and avoid rate limiting.';
        } else {
          errorMessage = `API Error: Invalid JSON response from ${options.companyId}. This may be a temporary issue. Please try again later.`;
          hint = 'Try disabling "Fetch Categories from Scrapers" in Settings to reduce API calls.';
        }
      } else if (isIsracardAmex) {
        hint = 'Isracard/Amex/VisaCal may be blocking automation. Try enabling Debug Mode (Show Browser) or disabling "Fetch Categories from Scrapers" in Settings.';
      }
      
      sendSSE(res, 'error', { 
        message: errorMessage,
        hint: hint
      });
      res.end();
      return;
    }

    if (!result.success) {
      const errorMsg = result.errorMessage || result.errorType || 'Scraping failed';
      console.error(`[Scrape Stream] Scraper failed:`, { errorType: result.errorType, errorMessage: result.errorMessage });
      await updateScrapeAudit(client, auditId, 'failed', errorMsg);
      
      // Provide helpful hints for common errors
      let hint = undefined;
      let displayError = errorMsg;
      
      if (result.errorType === 'InvalidPassword') {
        hint = 'Check your credentials. For Isracard, you need ID number + card 6 digits + password. For VisaCal, you need username + password.';
      } else if (errorMsg.includes('JSON') || errorMsg.includes('Unexpected end of JSON') || errorMsg.includes('invalid json') || errorMsg.includes('GetFrameStatus') || errorMsg.includes('frame') || errorMsg.includes('timeout')) {
        if (options.companyId === 'visaCal') {
          displayError = `VisaCal API Error: The Cal website returned an invalid response (${errorMsg}). This may be due to temporary service issues, rate limiting, or website changes. Please try again in a few minutes.`;
          hint = 'VisaCal API may be experiencing issues. Try enabling "Show Browser" mode to see what\'s happening, or wait a few minutes and try again.';
        } else {
          displayError = `API Error: Invalid JSON response from ${options.companyId} (${errorMsg}). This may be a temporary issue. Please try again later.`;
        }
      } else if (result.errorType === 'ChangePassword') {
        hint = 'You need to log into the bank/card website and change your password first.';
      } else if (errorMsg.includes('Block') || errorMsg.includes('automation')) {
        hint = 'The site is blocking automation. Enable Debug Mode to see the browser and try manually.';
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        hint = 'The request timed out. The site may be slow or blocking. Try again with Debug Mode enabled.';
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
      percent: 80
    });

    let bankTransactions = 0;
    let totalTransactions = 0;
    
    const cache = await loadCategoryCache(client);
    let cachedCategoryCount = 0;
    let skippedCards = 0;
    
    for (const account of result.accounts) {
      const ownedByOther = await checkCardOwnership(client, options.companyId, account.accountNumber, credentialId);
      
      if (ownedByOther) {
        console.log(`[Card Ownership] Skipping card ${account.accountNumber}`);
        sendSSE(res, 'progress', {
          step: 'skipping_card',
          message: `Skipping card ending in ${account.accountNumber} (already synced by another account)`,
          percent: 75
        });
        skippedCards++;
        continue;
      }
      
      await claimCardOwnership(client, options.companyId, account.accountNumber, credentialId);
      
      for (const txn of account.txns) {
        totalTransactions++;
        if (isBank) bankTransactions++;
        const hadCategory = txn.category && txn.category !== 'N/A';
        await insertTransaction(txn, client, options.companyId, isBank, account.accountNumber, cache);
        if (!hadCategory && lookupCachedCategory(txn.description, cache)) {
          cachedCategoryCount++;
        }
      }
    }

    // Update audit as success
    const accountsCount = Array.isArray(result.accounts) ? result.accounts.length : 0;
    await updateScrapeAudit(client, auditId, 'success', `Success: accounts=${accountsCount}, txns=${totalTransactions}`);

    // Update last_synced_at
    await updateCredentialLastSynced(client, credentialId);

    sendSSE(res, 'complete', {
      message: 'Scraping completed successfully!',
      percent: 100,
      summary: {
        accounts: result.accounts.length,
        transactions: totalTransactions,
        bankTransactions,
        cachedCategories: cachedCategoryCount,
        skippedCards
      }
    });

    res.end();
  } catch (error) {
    console.error('Scraping failed:', error);
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
