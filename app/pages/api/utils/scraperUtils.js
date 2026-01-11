/**
 * Shared Scraper Utilities
 * 
 * Consolidated functions used across scraper endpoints:
 * - scrape.js
 * - scrape_stream.js
 */

import { BANK_VENDORS, BEINLEUMI_GROUP_VENDORS } from '../../../utils/constants';
import { generateTransactionIdentifier } from './transactionUtils';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const cp = require('child_process');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Re-export core constants and utilities from our isolated core
export {
  RATE_LIMITED_VENDORS,
  getChromePath,
  getScraperOptions,
  getPreparePage,
  sleep
} from '../../../scrapers/core.js';

// Cache for description -> category mappings from our database
let categoryCache = null;

/**
 * Load category cache from database for known description -> category mappings
 */
export async function loadCategoryCache(client) {
  if (categoryCache !== null) return categoryCache;

  const result = await client.query(
    `SELECT description, category FROM transaction_categories`
  );

  categoryCache = {};
  for (const row of result.rows) {
    categoryCache[row.description.toLowerCase()] = row.category;
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
    ...rest
  } = rawCredentials;

  const credentials = { ...rest };

  if (vendor === 'hapoalim' || vendor === 'mizrahi' || vendor === 'yahav' || vendor === 'beinleumi' ||
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
  if (vendor === 'isracard' || vendor === 'amex') {
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
export async function insertTransaction(client, transaction, cardId, defaultCurrency) {
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
  } = transaction;

  const txId = identifier || generateTransactionIdentifier(transaction, cardId);

  // Check if transaction already exists
  const existing = await client.query(
    'SELECT id FROM transactions WHERE identifier = $1',
    [txId]
  );

  if (existing.rows.length > 0) {
    return { success: true, duplicated: true };
  }

  // Lookup category
  const category = lookupCachedCategory(description);

  await client.query(
    `INSERT INTO transactions (
      card_id, date, processed_date, amount, original_amount, 
      original_currency, currency, description, memo, status, 
      category, identifier
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      cardId, date, processedDate, chargedAmount, originalAmount,
      originalCurrency, defaultCurrency, description, memo, status,
      category, txId
    ]
  );

  return { success: true, duplicated: false };
}

/**
 * Check if a card is already owned by another user/credential
 */
export async function checkCardOwnership(client, last4Digits, vendor, currentCredentialId) {
  const result = await client.query(
    `SELECT vc.nickname, c.last_4_digits 
     FROM cards c 
     JOIN vendor_credentials vc ON c.credential_id = vc.id 
     WHERE c.last_4_digits = $1 AND vc.vendor = $2 AND vc.id != $3`,
    [last4Digits, vendor, currentCredentialId]
  );
  return result.rows[0] || null;
}

/**
 * Claim ownership of a card for a specific credential
 */
export async function claimCardOwnership(client, last4Digits, vendor, credentialId) {
  // Update the credential_id for any existing cards with this number/vendor
  await client.query(
    `UPDATE cards SET credential_id = $1 WHERE last_4_digits = $2 AND credential_id IN (
      SELECT id FROM vendor_credentials WHERE vendor = $3
    )`,
    [credentialId, last4Digits, vendor]
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

      // Only retry for specific errors (JSON parsing, network issues)
      const isRetryableError =
        errorMessage.includes('JSON') ||
        errorMessage.includes('Unexpected end of JSON') ||
        errorMessage.includes('invalid json') ||
        errorMessage.includes('GetFrameStatus') ||
        errorMessage.includes('network') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('timeout');

      if (!isRetryableError || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: baseDelay * 2^attempt (e.g., 5s, 10s, 20s)
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`[Retry] ${vendor} attempt ${attempt + 1}/${maxRetries + 1} failed with: ${errorMessage}. Retrying in ${delay / 1000}s...`);
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
    const runnerPath = path.join(process.cwd(), scrapersDir, 'runner.js');
    console.log(`[Worker] Spawning worker for ${scraperOptions.companyId} using ${runnerPath}`);

    // Use eval to hide the call from Turbopack's static analysis
    const forkFn = eval('cp.fork');
    const worker = forkFn(runnerPath, [], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env }
    });

    let result = null;

    worker.on('message', (message) => {
      if (message.type === 'ready') {
        worker.send({ action: 'scrape', scraperOptions, credentials });
      } else if (message.type === 'progress') {
        if (onProgress) onProgress(message.companyId, message.progress);
      } else if (message.type === 'success') {
        result = message.result;
      } else if (message.type === 'error') {
        const err = new Error(message.errorMessage || 'Unknown error in scraper worker');
        err.errorType = message.error;
        reject(err);
        worker.kill();
      }
    });

    worker.on('exit', (code) => {
      if (code !== 0 && !result) {
        reject(new Error(`Scraper worker exited with code ${code}`));
      } else {
        resolve(result);
      }
    });

    worker.on('error', (err) => {
      console.error('[Worker] Fatal error:', err);
      reject(err);
    });
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
