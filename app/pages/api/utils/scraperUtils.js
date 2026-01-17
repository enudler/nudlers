/**
 * Shared Scraper Utilities
 * 
 * Consolidated functions used across scraper endpoints:
 * - scrape.js
 * - scrape_stream.js
 */

import { BANK_VENDORS, BEINLEUMI_GROUP_VENDORS } from '../../../utils/constants.js';
import { generateTransactionIdentifier } from './transactionUtils.js';
import { createScraper } from 'israeli-bank-scrapers';

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
 * Load active categorization rules from database
 */
export async function loadCategorizationRules(client) {
  try {
    const res = await client.query(`
      SELECT name_pattern, target_category 
      FROM categorization_rules 
      WHERE is_active = true 
      ORDER BY id
    `);
    return res.rows;
  } catch (err) {
    // Table might not exist yet or other error
    if (!err.message.includes('does not exist')) {
      logger.warn({ error: err.message }, '[Categorization Rules] Failed to load rules');
    }
    return [];
  }
}

/**
 * Match a description against categorization rules
 */
/**
 * Match a description against categorization rules
 */
export function matchCategoryRule(description, rules) {
  if (!rules || !rules.length || !description) return null;
  const lowerDesc = description.toLowerCase();

  for (const rule of rules) {
    if (rule.name_pattern && lowerDesc.includes(rule.name_pattern.toLowerCase())) {
      return { category: rule.target_category, match: rule.name_pattern };
    }
  }
  return null;
}

/**
 * Load category mappings from database
 */
export async function loadCategoryMappings(client) {
  try {
    const result = await client.query(
      `SELECT source_category, target_category FROM category_mappings`
    );
    const mappings = {};
    for (const row of result.rows) {
      mappings[row.source_category] = row.target_category;
    }
    return mappings;
  } catch (err) {
    if (!err.message.includes('does not exist')) {
      logger.error({ error: err.message }, '[Category Mappings] Error loading category mappings');
    }
    return {};
  }
}

/**
 * Apply category mappings recursively to find the final target category
 */
export function applyCategoryMappings(category, mappings) {
  if (!category || !mappings || Object.keys(mappings).length === 0) return category;

  let currentCategory = category;
  let seen = new Set(); // Prevent infinite loops

  while (mappings[currentCategory] && !seen.has(currentCategory)) {
    seen.add(currentCategory);
    currentCategory = mappings[currentCategory];
  }

  return currentCategory;
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
export async function insertTransaction(client, transaction, vendor, accountNumber, defaultCurrency, categorizationRules = [], updateCategoryOnRescrape = false, categoryMappings = {}) {
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
    category: scraperCategory
  } = transaction;

  // Determine category
  // Priority: Cache (Exact previous edit) > Rule (Pattern match) > Scraper (Source)
  let finalCategory = scraperCategory || null;
  if (finalCategory === 'N/A') finalCategory = null;

  let categorySource = finalCategory ? 'scraper' : null;
  let ruleDetails = null;

  // Try Rules
  if (categorizationRules && categorizationRules.length > 0) {
    const ruleMatch = matchCategoryRule(description, categorizationRules);
    if (ruleMatch) {
      finalCategory = ruleMatch.category;
      categorySource = 'rule';
      ruleDetails = ruleMatch.match;
      logger.debug({ description, category: finalCategory, rule: ruleDetails }, '[Scraper] Matched category from rules');
    }
  }

  // Try Cache (Overrides scraper and rules if exact match exists, as this implies user correction)
  const cachedCategory = lookupCachedCategory(description);
  if (cachedCategory && cachedCategory !== 'N/A') {
    finalCategory = cachedCategory;
    categorySource = 'cache';
  }

  // Apply Persistent Mappings (If previous categories were merged into a new one)
  if (finalCategory && categoryMappings && Object.keys(categoryMappings).length > 0) {
    const mappedCategory = applyCategoryMappings(finalCategory, categoryMappings);
    if (mappedCategory !== finalCategory) {
      logger.debug({
        description,
        originalCategory: finalCategory,
        mappedCategory,
        source: categorySource
      }, '[Scraper] Applied persistent category mapping');
      finalCategory = mappedCategory;
      // We keep the original source (rule/cache/scraper) but the category is now mapped
    }
  }

  // Normalize values for business key check
  const normalizedName = (description || '').trim().toLowerCase();
  const normalizedAccountNumber = accountNumber || '';

  // 1. Generate identifier
  const txId = identifier || generateTransactionIdentifier(transaction, vendor, accountNumber);
  const signedPrice = chargedAmount || originalAmount || 0;
  const absPrice = Math.abs(signedPrice);

  // 2. Try to find existing transaction (by identifier OR business key)
  let existingRes = await client.query(
    'SELECT identifier, category, category_source, price FROM transactions WHERE identifier = $1 AND vendor = $2',
    [txId, vendor]
  );

  if (existingRes.rows.length === 0) {
    // Check business key constraint (vendor, date, name, price, account_number)
    // Extended check: also look for ±1 day shift for timezone-related duplicates
    existingRes = await client.query(
      `SELECT identifier, category, category_source, price FROM transactions 
       WHERE vendor = $1 
         AND ABS(date - $2) <= 1
         AND LOWER(TRIM(name)) = $3 
         AND ABS(price) = $4 
         AND COALESCE(account_number, '') = $5`,
      [vendor, date, normalizedName, absPrice, normalizedAccountNumber]
    );
  }

  // 3. If found ANY existing transaction, handle updates
  if (existingRes.rows.length > 0) {
    const existingRow = existingRes.rows[0];
    const realIdentifier = existingRow.identifier; // Use DB identifier for updates to ensure we target the right row
    const currentPrice = parseFloat(existingRow.price);
    let wasUpdated = false;

    // A. Fix price sign/value if different (Crucial for Bank transactions)
    if (currentPrice !== signedPrice) {
      logger.info({
        identifier: realIdentifier,
        vendor,
        oldPrice: currentPrice,
        newPrice: signedPrice
      }, '[Scraper] Updating transaction price sign/value');
      await client.query(
        'UPDATE transactions SET price = $1 WHERE identifier = $2 AND vendor = $3',
        [signedPrice, realIdentifier, vendor]
      );
      wasUpdated = true;
    }

    // B. Category update logic (If enabled and we have a better category)
    if (updateCategoryOnRescrape && finalCategory && finalCategory !== 'N/A' && finalCategory !== '') {
      const currentCategory = existingRow.category;
      const currentSource = existingRow.category_source;

      const isCurrentCategoryEmpty = !currentCategory ||
        currentCategory === 'N/A' ||
        currentCategory === '' ||
        currentCategory.toLowerCase() === 'uncategorized';

      const shouldUpdate = isCurrentCategoryEmpty || (currentSource !== 'cache' && currentCategory !== finalCategory);

      if (shouldUpdate && currentCategory !== finalCategory) {
        logger.info({
          identifier: realIdentifier,
          vendor,
          oldCategory: currentCategory,
          newCategory: finalCategory
        }, '[Scraper] Updating transaction category based on re-scrape');

        await client.query(
          'UPDATE transactions SET category = $1, category_source = $2, rule_matched = $3 WHERE identifier = $4 AND vendor = $5',
          [finalCategory, categorySource, ruleDetails, realIdentifier, vendor]
        );
        return {
          success: true,
          duplicated: true,
          updated: true,
          newCategory: finalCategory,
          oldCategory: currentCategory,
          categorySource,
          ruleMatched: ruleDetails
        };
      }
    }

    return { success: true, duplicated: true, updated: wasUpdated };
  }

  // Calculate processed_date if not provided or it's a credit card transaction that defaults to transaction date
  let finalProcessedDate = processedDate;
  const isBank = BANK_VENDORS.includes(vendor);

  if (!isBank) {
    // For credit cards, if processedDate is missing or same as date, we might need to adjust it
    // based on the billing cycle start day
    try {
      const settingsRes = await client.query("SELECT value FROM app_settings WHERE key = 'billing_cycle_start_day'");
      const billingStartDay = settingsRes.rows.length > 0 ? parseInt(settingsRes.rows[0].value) || 10 : 10;

      const txDate = new Date(date);
      const txDay = txDate.getDate();

      // If processedDate is null, undefined, or same as txDate, and the day is past the cutoff
      // then we should move it to the "next" cycle (the Start Day of next month)
      const isDateMissingOrSame = !processedDate || new Date(processedDate).getTime() === txDate.getTime();

      if (isDateMissingOrSame && txDay > billingStartDay) {
        // Move to next month's billing day
        const nextMonthDate = new Date(txDate.getFullYear(), txDate.getMonth() + 1, billingStartDay);
        finalProcessedDate = nextMonthDate.toISOString().split('T')[0];
        logger.info({ vendor, description, date, originalProcessedDate: processedDate, newProcessedDate: finalProcessedDate }, '[Scraper] Adjusted processed_date based on billing cycle cutoff');
      } else if (!processedDate) {
        // Just default to txDate if not setting it to next month
        finalProcessedDate = date;
      }
    } catch (e) {
      logger.error({ error: e.message }, '[Scraper] Error calculating processed_date, falling back to original');
      finalProcessedDate = processedDate || date;
    }
  }

  // (Category logic moved to top)

  // Extra check for installments: if this is an installment, check if a "total" transaction 
  // exists with the same name and date but different price (original_amount instead of price)
  if (installmentsTotal > 1) {
    const totalMatchCheck = await client.query(
      `SELECT identifier FROM transactions 
       WHERE vendor = $1 
         AND ABS(date - $2) <= 1
         AND LOWER(TRIM(name)) = $3 
         AND (ABS(price) = $4 OR ABS(original_amount) = $4)
         AND (installments_total IS NULL OR installments_total <= 1)`,
      [vendor, date, normalizedName, Math.abs(originalAmount || chargedAmount)]
    );

    if (totalMatchCheck.rows.length > 0) {
      logger.info({ vendor, description, date }, '[Scraper] Found matching total transaction for installment, skipping as duplicate');
      return { success: true, duplicated: true };
    }
  }

  // Insert transaction matching the actual database schema
  // Use ON CONFLICT to handle race conditions gracefully
  try {
    await client.query(
      `INSERT INTO transactions (
        identifier, vendor, date, name, price, category, type,
        processed_date, original_amount, original_currency, 
        charged_currency, memo, status, 
        installments_number, installments_total, account_number,
        category_source, rule_matched
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (identifier, vendor) DO NOTHING`,
      [
        txId, vendor, date, description || '', signedPrice,
        finalCategory, type, finalProcessedDate, originalAmount, originalCurrency,
        defaultCurrency, memo, status || 'completed',
        installmentsNumber, installmentsTotal, accountNumber,
        categorySource, ruleDetails
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

  return {
    success: true,
    duplicated: false,
    category: finalCategory,
    categorySource,
    ruleMatched: ruleDetails
  };
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
export async function updateScrapeAudit(client, auditId, status, message, report = null) {
  if (!auditId) return;
  if (report) {
    await client.query(
      `UPDATE scrape_events SET status = $1, message = $2, report_json = $3 WHERE id = $4`,
      [status, message, report, auditId]
    );
  } else {
    await client.query(
      `UPDATE scrape_events SET status = $1, message = $2 WHERE id = $3`,
      [status, message, auditId]
    );
  }
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
 * Runs the scraper directly in the main process
 * @param {Object} scraperOptions - Options for createScraper
 * @param {Object} credentials - Scraper credentials
 * @param {Function} onProgress - Progress callback
 */
export async function runScraper(scraperOptions, credentials, onProgress) {
  logger.info({ companyId: scraperOptions.companyId }, '[Scraper] Starting Direct Scrape');

  // Fix non-serializable options (just in case they came from JSON)
  const startDate = new Date(scraperOptions.startDate);

  // Add non-serializable options like preparePage
  const isRateLimited = RATE_LIMITED_VENDORS.includes(scraperOptions.companyId);

  const options = {
    ...scraperOptions,
    startDate,
    preparePage: getPreparePage(isRateLimited)
  };

  logger.info('[Scraper] Creating scraper instance');
  const scraper = createScraper(options);

  // Listen for internal scraper events
  if (scraper && typeof scraper.on === 'function') {
    scraper.on('progress', (companyId, progress) => {
      logger.debug({ companyId, progressType: progress?.type || 'unknown' }, '[Scraper] Progress event');
      if (onProgress) {
        onProgress(companyId, progress);
      }
    });
  }

  logger.info('[Scraper] Starting scrape execution');

  // Log credentials structure (masked)
  const maskedCreds = Object.fromEntries(
    Object.entries(credentials || {}).map(([k, v]) => [
      k,
      v ? `${String(v).substring(0, 2)}***${String(v).substring(String(v).length - 2)} (${String(v).length} chars)` : 'EMPTY'
    ])
  );
  logger.info({
    companyId: scraperOptions.companyId,
    credentialKeys: Object.keys(credentials || {}),
    credentials: maskedCreds
  }, '[Scraper] Credentials ready');

  try {
    const result = await scraper.scrape(credentials);
    logger.info({ success: result?.success }, '[Scraper] Scrape completed');

    // We don't need complex sanitization since we are in the same process,
    // but we should still ensure the result structure matches what the API expects

    // Ensure accounts is an array if present
    if (result.success && result.accounts && !Array.isArray(result.accounts)) {
      result.accounts = [];
    }

    return result;
  } catch (err) {
    logger.error({
      error: err.message,
      stack: err.stack,
      name: err.name,
      vendor: scraperOptions.companyId
    }, '[Scraper] Fatal error during scrape');

    // Re-throw or format error similar to how worker did?
    // The API endpoint catching this likely expects an Error object.
    throw err;
  }
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

export async function getRateLimitedTimeoutSetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'scraper_timeout_rate_limited'");
  return result.rows.length > 0 ? parseInt(result.rows[0].value) || 120000 : 120000;
}

export async function getStandardTimeoutSetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'scraper_timeout_standard'");
  return result.rows.length > 0 ? parseInt(result.rows[0].value) || 60000 : 60000;
}

export async function getFallbackCategorySetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'fallback_no_category_on_error'");
  return result.rows.length > 0 ? result.rows[0].value === true || result.rows[0].value === 'true' : false;
}

export async function getUpdateCategoryOnRescrapeSetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'update_category_on_rescrape'");
  return result.rows.length > 0 ? result.rows[0].value === true || result.rows[0].value === 'true' : false;
}

export async function getScrapeRetriesSetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'scrape_retries'");
  return result.rows.length > 0 ? parseInt(result.rows[0].value) || 3 : 3;
}
