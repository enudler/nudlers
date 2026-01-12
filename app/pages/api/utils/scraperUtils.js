/**
 * Shared Scraper Utilities
 * 
 * Consolidated functions used across scraper endpoints:
 * - scrape.js
 * - scrape_stream.js
 */

import { BANK_VENDORS, BEINLEUMI_GROUP_VENDORS } from '../../../utils/constants';
import { generateTransactionIdentifier } from './transactionUtils.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const cp = require('child_process');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import logger from '../../../utils/logger.js';
import {
  RATE_LIMITED_VENDORS,
  getChromePath,
  getScraperOptions,
  getPreparePage,
  sleep
} from '../../../scrapers/core.js';

export {
  RATE_LIMITED_VENDORS,
  getChromePath,
  getScraperOptions,
  getPreparePage,
  sleep
};

// Cache for description -> category mappings from our database
let categoryCache = null;

/**
 * Load category cache from database for known description -> category mappings
 * Builds cache from existing transactions if transaction_categories table doesn't exist
 */
export async function loadCategoryCache(client) {
  if (categoryCache !== null) return categoryCache;

  categoryCache = {};

  try {
    // Try to load from transaction_categories table if it exists
    const result = await client.query(
      `SELECT description, category FROM transaction_categories`
    );

    for (const row of result.rows) {
      if (row.description && row.category) {
        categoryCache[row.description.toLowerCase()] = row.category;
      }
    }
  } catch (err) {
    // If table doesn't exist, build cache from transactions table
    if (err.message && err.message.includes('does not exist')) {
      logger.info('[Category Cache] transaction_categories table not found, building cache from transactions');
      try {
        const result = await client.query(
          `SELECT DISTINCT name, category FROM transactions WHERE category IS NOT NULL AND category != ''`
        );

        for (const row of result.rows) {
          if (row.name && row.category) {
            categoryCache[row.name.toLowerCase()] = row.category;
          }
        }
        logger.info({ count: Object.keys(categoryCache).length }, '[Category Cache] Built cache from transactions');
      } catch (fallbackErr) {
        logger.error({ error: fallbackErr.message }, '[Category Cache] Failed to build cache from transactions');
        // Return empty cache if both fail
        return categoryCache;
      }
    } else {
      logger.error({ error: err.message }, '[Category Cache] Error loading category cache');
      // Return empty cache on error
      return categoryCache;
    }
  }

  return categoryCache;
}

/**
 * Lookup category from cache based on transaction description
 */
export function lookupCachedCategory(description) {
  if (!categoryCache || !description) return null;
  return categoryCache[description.toLowerCase()] || null;
}

/**
 * Prepare credentials based on vendor type
 */
export function prepareCredentials(vendor, rawCredentials) {
  const {
    username,
    password,
    id,
    num,
    card6Digits,
    nickname,
    userCode,
    ...rest
  } = rawCredentials;

  const credentials = { ...rest };

  // Hapoalim requires userCode (not username)
  if (vendor === 'hapoalim') {
    // Use userCode if provided, otherwise fall back to username/id/id_number
    const hapoalimUserCode = userCode || username || id || rawCredentials.id_number || '';
    credentials.userCode = String(hapoalimUserCode);
    credentials.password = String(password || '');
  } else if (vendor === 'mizrahi' || vendor === 'yahav' || vendor === 'beinleumi' ||
    vendor === 'otsarHahayal' || vendor === 'mercantile' || vendor === 'leumi' || vendor === 'mercantile' ||
    vendor === 'igud' || vendor === 'massad' || vendor === 'discount') {
    credentials.username = username;
    credentials.password = password;
  } else if (vendor === 'isracard' || vendor === 'amex') {
    credentials.id = id;
    credentials.card6Digits = card6Digits;
    credentials.password = password;
  } else if (vendor === 'max' || vendor === 'visaCal') {
    credentials.username = username;
    credentials.password = password;
  }

  return credentials;
}

/**
 * Validate credentials for a specific vendor
 */
export function validateCredentials(credentials, vendor) {
  if (vendor === 'hapoalim') {
    if (!credentials.userCode || !credentials.password) {
      throw new Error(`Invalid credentials for ${vendor}: userCode and password are required.`);
    }
  } else if (vendor === 'isracard' || vendor === 'amex') {
    if (!credentials.id || !credentials.card6Digits || !credentials.password) {
      throw new Error(`Invalid credentials for ${vendor}: id, card6Digits, and password are required.`);
    }
  } else if (vendor === 'max' || vendor === 'visaCal') {
    if (!credentials.username || !credentials.password) {
      throw new Error(`Invalid credentials for ${vendor}: username and password are required.`);
    }
  } else {
    if (!credentials.username || !credentials.password) {
      throw new Error(`Invalid credentials for ${vendor}: username and password are required.`);
    }
  }
}

/**
 * Insert a transaction into the database
 */
export async function insertTransaction(client, transaction, vendor, accountNumber, defaultCurrency) {
  const {
    date,
    processedDate,
    originalAmount,
    originalCurrency,
    chargedAmount,
    description,
    memo,
    status,
    identifier,
    type,
    installmentsNumber,
    installmentsTotal,
  } = transaction;

  // Generate identifier if not provided
  const txId = identifier || generateTransactionIdentifier(transaction, vendor, accountNumber);

  // Check if transaction already exists (primary key is identifier + vendor)
  const existing = await client.query(
    'SELECT identifier FROM transactions WHERE identifier = $1 AND vendor = $2',
    [txId, vendor]
  );

  if (existing.rows.length > 0) {
    return { success: true, duplicated: true };
  }

  // Lookup category
  const category = lookupCachedCategory(description);

  // Determine transaction type if not provided
  const transactionType = type || (chargedAmount < 0 ? 'expense' : 'income');

  // Normalize values for business key check
  const normalizedName = (description || '').trim().toLowerCase();
  const normalizedPrice = Math.abs(chargedAmount || originalAmount || 0);
  const normalizedAccountNumber = accountNumber || '';

  // Check business key constraint (vendor, date, name, price, account_number)
  const businessKeyCheck = await client.query(
    `SELECT identifier FROM transactions 
     WHERE vendor = $1 
       AND date = $2 
       AND LOWER(TRIM(name)) = $3 
       AND ABS(price) = $4 
       AND COALESCE(account_number, '') = $5`,
    [vendor, date, normalizedName, normalizedPrice, normalizedAccountNumber]
  );

  if (businessKeyCheck.rows.length > 0) {
    return { success: true, duplicated: true };
  }

  // Insert transaction matching the actual database schema
  // Use ON CONFLICT to handle race conditions gracefully
  try {
    await client.query(
      `INSERT INTO transactions (
        identifier, vendor, date, name, price, category, type,
        processed_date, original_amount, original_currency, 
        charged_currency, memo, status, 
        installments_number, installments_total, account_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (identifier, vendor) DO NOTHING`,
      [
        txId, vendor, date, description || '', normalizedPrice,
        category, transactionType, processedDate, originalAmount, originalCurrency,
        defaultCurrency, memo, status || 'completed',
        installmentsNumber, installmentsTotal, accountNumber
      ]
    );
  } catch (err) {
    // Handle business key constraint violation
    if (err.code === '23505' && err.constraint === 'idx_transactions_business_key') {
      return { success: true, duplicated: true };
    }
    // Re-throw other errors
    throw err;
  }

  return { success: true, duplicated: false };
}

/**
 * Check if a card is already owned by another user/credential
 */
export async function checkCardOwnership(client, accountNumber, vendor, currentCredentialId) {
  const result = await client.query(
    `SELECT co.id, vc.nickname, co.account_number 
     FROM card_ownership co 
     JOIN vendor_credentials vc ON co.credential_id = vc.id 
     WHERE co.account_number = $1 AND co.vendor = $2 AND co.credential_id != $3`,
    [accountNumber, vendor, currentCredentialId]
  );
  return result.rows[0] || null;
}

/**
 * Claim ownership of a card for a specific credential
 */
export async function claimCardOwnership(client, accountNumber, vendor, credentialId) {
  // Insert or update card ownership
  await client.query(
    `INSERT INTO card_ownership (vendor, account_number, credential_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (vendor, account_number) 
     DO UPDATE SET credential_id = $3`,
    [vendor, accountNumber, credentialId]
  );
}

/**
 * Retry function with exponential backoff
 * Particularly useful for VisaCal/Cal which has intermittent JSON parsing errors
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries (default: 2)
 * @param {number} baseDelay - Base delay in ms between retries (default: 5000)
 * @param {string} vendor - Vendor name for logging
 */
export async function retryWithBackoff(fn, maxRetries = 2, baseDelay = 5000, vendor = 'unknown') {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorMessage = error.message || '';

      // Only retry for specific errors (JSON parsing, network issues, VisaCal-specific errors)
      const isRetryableError =
        errorMessage.includes('JSON') ||
        errorMessage.includes('Unexpected end of JSON') ||
        errorMessage.includes('invalid json') ||
        errorMessage.includes('GetFrameStatus') ||
        errorMessage.includes('frame') ||
        errorMessage.includes('network') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNREFUSED') ||
        (vendor === 'visaCal' && (
          errorMessage.includes('fetch') ||
          errorMessage.includes('request') ||
          errorMessage.includes('response') ||
          errorMessage.includes('connection')
        ));

      if (!isRetryableError || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: baseDelay * 2^attempt (e.g., 5s, 10s, 20s)
      const delay = baseDelay * Math.pow(2, attempt);
      logger.info({ vendor, attempt: attempt + 1, maxRetries: maxRetries + 1, errorMessage, delaySeconds: delay / 1000 }, '[Retry] Retrying after failure');
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Insert a scrape audit row
 */
export async function insertScrapeAudit(client, triggeredBy, vendor, startDate, message = 'Scrape initiated') {
  const result = await client.query(
    `INSERT INTO scrape_events (triggered_by, vendor, start_date, status, message)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [triggeredBy, vendor, startDate, 'started', message]
  );
  return result.rows[0]?.id;
}

/**
 * Update a scrape audit row
 */
export async function updateScrapeAudit(client, auditId, status, message) {
  if (!auditId) return;
  await client.query(
    `UPDATE scrape_events SET status = $1, message = $2 WHERE id = $3`,
    [status, message, auditId]
  );
}

/**
 * Update last_synced_at on a credential
 */
export async function updateCredentialLastSynced(client, credentialId) {
  if (!credentialId) return;
  await client.query(
    `UPDATE vendor_credentials SET last_synced_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [credentialId]
  );
}

/**
 * Get delay in seconds based on vendor type
 */
export function getVendorDelay(vendor, baseDelay) {
  if (RATE_LIMITED_VENDORS.includes(vendor)) {
    // Isracard/Amex/Max need much longer delays (60-120 seconds)
    return Math.max(baseDelay, 60) + Math.floor(Math.random() * 60);
  }
  return baseDelay;
}

/**
 * Format date as YYYY-MM-DD in local timezone
 */
export function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Runs the scraper in an isolated worker process (hot-reload compatible)
 * @param {Object} scraperOptions - Options for createScraper
 * @param {Object} credentials - Scraper credentials
 * @param {Function} onProgress - Progress callback
 */
export function runScraperInWorker(scraperOptions, credentials, onProgress) {
  return new Promise((resolve, reject) => {
    // Path to runner.js relative to the project root
    // In standalone build, process.cwd() is the root of the standalone folder
    // We use join with a dynamic element to hide this from the Turbopack optimizer/tracer
    const scrapersDir = 'scrapers';
    // Try multiple possible paths for runner.js
    let runnerPath = path.join(process.cwd(), scrapersDir, 'runner.js');
    
    // If running from app directory, adjust path
    if (!fs.existsSync(runnerPath) && process.cwd().endsWith('app')) {
      runnerPath = path.join(process.cwd(), '..', scrapersDir, 'runner.js');
    }
    // If still not found, try app/scrapers
    if (!fs.existsSync(runnerPath)) {
      runnerPath = path.join(process.cwd(), 'app', scrapersDir, 'runner.js');
    }
    
    logger.info({ companyId: scraperOptions.companyId, runnerPath, pathExists: fs.existsSync(runnerPath), cwd: process.cwd() }, '[Worker] Spawning worker');
    
    if (!fs.existsSync(runnerPath)) {
      reject(new Error(`Scraper runner not found at ${runnerPath}. Please ensure runner.js exists in the scrapers directory.`));
      return;
    }

    // Use eval to hide the call from Turbopack's static analysis
    const forkFn = eval('cp.fork');
    const worker = forkFn(runnerPath, [], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env }
    });

    let result = null;
    let workerReady = false;
    let scrapeStarted = false;
    const timeout = scraperOptions.timeout || scraperOptions.defaultTimeout || 120000;
    let timeoutHandle = null;

    // Set up timeout to detect hanging workers
    timeoutHandle = setTimeout(() => {
      if (!result && !scrapeStarted) {
        logger.error({ timeout }, '[Worker] Timeout: Worker did not start scraping');
        worker.kill('SIGTERM');
        reject(new Error(`Scraper timeout: Worker did not start scraping within ${timeout / 1000} seconds. The scraper may be hanging or the website may be blocking automation.`));
      } else if (!result && scrapeStarted) {
        logger.error({ timeout }, '[Worker] Timeout: Scraper exceeded timeout');
        worker.kill('SIGTERM');
        reject(new Error(`Scraper timeout: The scraping process exceeded the timeout of ${timeout / 1000} seconds. This may indicate the website is slow or blocking automation.`));
      }
    }, timeout + 10000); // Add 10 seconds buffer

    worker.on('message', (message) => {
      logger.debug({ messageType: message.type }, '[Worker] Received message');
      if (message.type === 'ready') {
        workerReady = true;
        logger.info('[Worker] Worker ready, sending scrape command');
        worker.send({ action: 'scrape', scraperOptions, credentials });
      } else if (message.type === 'progress') {
        scrapeStarted = true;
        if (onProgress) {
          logger.debug({ progress: message.progress }, '[Worker] Progress update');
          onProgress(message.companyId, message.progress);
        }
      } else if (message.type === 'success') {
        clearTimeout(timeoutHandle);
        result = message.result;
        logger.info({ accountCount: result.accounts?.length || 0 }, '[Worker] Scrape successful');
        worker.kill();
        resolve(result);
      } else if (message.type === 'error') {
        clearTimeout(timeoutHandle);
        const err = new Error(message.errorMessage || 'Unknown error in scraper worker');
        err.errorType = message.error;
        logger.error({ error: err.message }, '[Worker] Scrape error');
        worker.kill();
        reject(err);
      }
    });

    worker.on('exit', (code, signal) => {
      clearTimeout(timeoutHandle);
      logger.info({ code, signal }, '[Worker] Worker exited');
      if (code !== 0 && !result) {
        reject(new Error(`Scraper worker exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`));
      } else if (result) {
        resolve(result);
      } else if (code === 0) {
        // Worker exited cleanly but no result - might have been killed
        reject(new Error('Scraper worker exited unexpectedly without completing'));
      }
    });

    worker.on('error', (err) => {
      clearTimeout(timeoutHandle);
      logger.error({ error: err.message, stack: err.stack }, '[Worker] Fatal error');
      reject(err);
    });

    // Handle case where worker doesn't send 'ready' message
    setTimeout(() => {
      if (!workerReady) {
        logger.error('[Worker] Worker did not send ready message within 5 seconds');
        worker.kill('SIGTERM');
        reject(new Error('Scraper worker failed to initialize. Check if runner.js exists and is executable.'));
      }
    }, 5000);
  });
}

// Re-export specific settings helpers
export async function getShowBrowserSetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'show_browser'");
  return result.rows.length > 0 ? result.rows[0].value === true || result.rows[0].value === 'true' : false;
}

export async function getFetchCategoriesSetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'fetch_categories_from_scrapers'");
  return result.rows.length > 0 ? result.rows[0].value === true || result.rows[0].value === 'true' : true;
}

export async function getStandardTimeoutSetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'scraper_timeout_standard'");
  return result.rows.length > 0 ? parseInt(result.rows[0].value) || 60000 : 60000;
}

export async function getRateLimitedTimeoutSetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'scraper_timeout_rate_limited'");
  return result.rows.length > 0 ? parseInt(result.rows[0].value) || 120000 : 120000;
}
