import { CompanyTypes, createScraper } from 'israeli-bank-scrapers';
import { getDB } from './db';
import { BANK_VENDORS } from '../../utils/constants';
import { withAuth } from './middleware/auth';
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

    sendSSE(res, 'progress', { 
      step: 'init', 
      message: `Initializing scraper for ${options.companyId}...`,
      percent: 5
    });

    const isBank = BANK_VENDORS.includes(options.companyId);
    const isIsracardAmex = RATE_LIMITED_VENDORS.includes(options.companyId);

    // Prepare and validate credentials
    const scraperCredentials = prepareCredentials(options.companyId, credentials);
    
    try {
      validateCredentials(scraperCredentials);
    } catch (error) {
      sendSSE(res, 'error', { message: error.message });
      res.end();
      return;
    }

    // For Isracard/Amex/Max, add a pre-scrape delay
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

    // Build scraper options with progress callback
    // Pass showBrowser option from client (for debugging/2FA)
    const scraperOptions = {
      ...getScraperOptions(companyId, new Date(options.startDate), isIsracardAmex, {
        timeout: isIsracardAmex ? 240000 : 120000,
        defaultTimeout: isIsracardAmex ? 240000 : 120000,
        showBrowser: options.showBrowser ?? false,
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

    let result;
    try {
      result = await scraper.scrape(scraperCredentials);
    } catch (scrapeError) {
      await updateScrapeAudit(client, auditId, 'failed', scrapeError.message || 'Scraper exception');
      sendSSE(res, 'error', { message: `Scraper exception: ${scrapeError.message}` });
      res.end();
      return;
    }

    if (!result.success) {
      const errorMsg = result.errorMessage || result.errorType || 'Scraping failed';
      await updateScrapeAudit(client, auditId, 'failed', errorMsg);
      sendSSE(res, 'error', { message: `${result.errorType || 'GENERIC'}: ${errorMsg}` });
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

export default withAuth(handler);
