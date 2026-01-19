/**
 * Shared Scraper Utilities
 * 
 * Consolidated functions used across scraper endpoints:
 * - scrape.js
 * - scrape_stream.js
 */

import { BANK_VENDORS } from '../../../utils/constants.js';
import { generateTransactionIdentifier } from './transactionUtils.js';
import { createScraper } from 'israeli-bank-scrapers';
import logger from '../../../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import {
  getChromePath,
  getScraperOptions,
  getPreparePage,
  sleep,
  RATE_LIMITED_VENDORS
} from '../../../scrapers/core.js';

export {
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
    vendor === 'otsarHahayal' || vendor === 'mercantile' || vendor === 'leumi' ||
    vendor === 'igud' || vendor === 'massad' || vendor === 'discount') {
    credentials.username = username;
    credentials.password = password;
    // Include account number (num) if provided for banks that require it
    if (num) {
      credentials.num = num;
    }
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
 * @param {boolean} isBank - Whether this is a bank transaction (true) or credit card (false)
 */
export async function insertTransaction(client, transaction, vendor, accountNumber, defaultCurrency, categorizationRules = [], updateCategoryOnRescrape = false, categoryMappings = {}, isBank = false, billingCycleStartDay = 10) {
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

  // Generate identifier if not provided
  const txId = identifier || generateTransactionIdentifier(transaction, vendor, accountNumber);

  // Check if transaction already exists (primary key is identifier + vendor)
  const existing = await client.query(
    'SELECT identifier, name, price, date, category, category_source FROM transactions WHERE identifier = $1 AND vendor = $2',
    [txId, vendor]
  );

  if (existing.rows.length > 0) {
    // Check if this is a true duplicate or a collision
    const dbTx = existing.rows[0];
    const normalizedDbName = (dbTx.name || '').trim().toLowerCase();
    const normalizedNewName = (description || '').trim().toLowerCase();
    const dbPrice = Math.abs(dbTx.price || 0);
    const newPrice = Math.abs(chargedAmount || originalAmount || 0);

    // It's a collision if:
    // 1. Names are significantly different (not just case/whitespace)
    // 2. OR prices are different
    // 3. OR dates are different
    const isCollision = (normalizedDbName !== normalizedNewName && !normalizedDbName.includes(normalizedNewName) && !normalizedNewName.includes(normalizedDbName)) ||
      (Math.abs(dbPrice - newPrice) > 0.01) ||
      (new Date(dbTx.date).toISOString().split('T')[0] !== new Date(date).toISOString().split('T')[0]);

    if (isCollision) {
      logger.warn({
        txId,
        vendor,
        dbName: dbTx.name,
        newName: description,
        dbPrice,
        newPrice,
        dbDate: dbTx.date,
        newDate: date
      }, '[Scraper] Identifier collision detected! Generating robust fallback ID.');

      // Use the robust identifier generator which combines multiple fields
      const fallbackId = generateTransactionIdentifier(transaction, vendor, accountNumber);

      // Recursive call with the new ID
      return insertTransaction(client, { ...transaction, identifier: fallbackId }, vendor, accountNumber, defaultCurrency, categorizationRules, updateCategoryOnRescrape, categoryMappings, isBank, billingCycleStartDay);
    }

    // If enabled and we have a new resolved category (from scraper OR rules OR cache)
    if (updateCategoryOnRescrape && finalCategory && finalCategory !== 'N/A' && finalCategory !== '') {
      const currentCategory = dbTx.category;
      const currentSource = dbTx.category_source;

      // Only update if the current category is essentially empty/undefined/N/A/Uncategorized
      // OR if it's not a manual edit (cache) and we have a better category
      const isCurrentCategoryEmpty = !currentCategory ||
        currentCategory === 'N/A' ||
        currentCategory === '' ||
        currentCategory.toLowerCase() === 'uncategorized';

      // Allow update if empty, OR if not manual override (cache) and different
      const shouldUpdate = isCurrentCategoryEmpty || (currentSource !== 'cache' && currentCategory !== finalCategory);

      if (shouldUpdate && currentCategory !== finalCategory) {
        logger.info({
          txId,
          vendor,
          oldCategory: currentCategory,
          newCategory: finalCategory,
          oldSource: currentSource,
          newSource: categorySource
        }, '[Scraper] Updating transaction category based on re-scrape');

        await client.query(
          'UPDATE transactions SET category = $1, category_source = $2, rule_matched = $3 WHERE identifier = $4 AND vendor = $5',
          [finalCategory, categorySource, ruleDetails, txId, vendor]
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

    return { success: true, duplicated: true, updated: false };
  }

  // Normalize values for business key check
  const normalizedName = (description || '').trim().toLowerCase();
  const normalizedPrice = Math.abs(chargedAmount || originalAmount || 0);
  const finalPrice = chargedAmount || originalAmount || 0;
  const normalizedAccountNumber = accountNumber || '';

  // Calculate processed_date if not provided or it's a credit card transaction that defaults to transaction date
  let finalProcessedDate = processedDate;
  // isBank is already passed as a parameter

  if (!isBank) {
    // For credit cards, if processedDate is missing or same as date, we might need to adjust it
    // For credit cards, if processedDate is missing or same as date, we might need to adjust it
    // based on the billing cycle start day
    try {
      // Use passed billingCycleStartDay (defaulted to 10 if not provided, though caller should provide it)
      const billingStartDay = billingCycleStartDay || 10;

      const txDate = new Date(date);
      const txDay = txDate.getDate();

      // If processedDate is null, undefined, or same as txDate, and the day is past the cutoff
      // then we should move it to the "next" cycle (the Start Day of next month)
      const isDateMissingOrSame = !processedDate || new Date(processedDate).getTime() === txDate.getTime();

      if (isDateMissingOrSame && txDay > billingStartDay) {
        // Move to next month's billing day
        const nextMonthDate = new Date(txDate.getFullYear(), txDate.getMonth() + 1, billingStartDay);
        finalProcessedDate = nextMonthDate.toISOString().split('T')[0];
        logger.debug({ vendor, description, date, originalProcessedDate: processedDate, newProcessedDate: finalProcessedDate }, '[Scraper] Adjusted processed_date based on billing cycle cutoff');
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

  // Check business key constraint (vendor, date, name, price, account_number)
  // Extended check: also look for ±1 day shift for timezone-related duplicates
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
    logger.info({ vendor, description, date, price: normalizedPrice }, '[Scraper] Skipping duplicate transaction (business key match)');
    return { success: true, duplicated: true };
  }

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
  const transactionType = isBank ? 'bank' : 'credit_card';

  try {
    await client.query(
      `INSERT INTO transactions (
        identifier, vendor, date, name, price, category, type,
        processed_date, original_amount, original_currency, 
        charged_currency, memo, status, 
        installments_number, installments_total, account_number,
        category_source, rule_matched, transaction_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (identifier, vendor) DO NOTHING`,
      [
        txId, vendor, date, description || '', finalPrice,
        finalCategory, type, finalProcessedDate, originalAmount, originalCurrency,
        defaultCurrency, memo, status || 'completed',
        installmentsNumber, installmentsTotal, accountNumber,
        categorySource, ruleDetails, transactionType
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
      `UPDATE scrape_events 
       SET status = $1, 
           message = $2, 
           report_json = $3,
           duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))
       WHERE id = $4`,
      [status, message, report, auditId]
    );
  } else {
    await client.query(
      `UPDATE scrape_events 
       SET status = $1, 
           message = $2,
           duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))
       WHERE id = $3`,
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
 * Format date as YYYY-MM-DD in local timezone
 */
export function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fetch category for a single transaction from Isracard API
 * Uses the authenticated browser page to make the request
 */
async function fetchCategoryFromIsracard(page, txn, accountIndex, moedChiuv) {
  const SERVICES_URL = 'https://digital.isracard.co.il/services/ProxyRequestHandler.ashx';

  const url = new URL(SERVICES_URL);
  url.searchParams.set('reqName', 'PirteyIska_204');
  url.searchParams.set('CardIndex', accountIndex.toString());
  url.searchParams.set('shovarRatz', txn.identifier.toString());
  url.searchParams.set('moedChiuv', moedChiuv);

  try {
    // Use page.evaluate to make the request within the authenticated session
    const result = await page.evaluate(async (apiUrl) => {
      try {
        const response = await fetch(apiUrl, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
          }
        });
        if (!response.ok) {
          return { error: response.status };
        }
        return await response.json();
      } catch (e) {
        return { error: e.message };
      }
    }, url.toString());

    if (result.error) {
      return { category: null, error: result.error };
    }

    const category = result?.PirteyIska_204Bean?.sector?.trim() || null;
    return { category, error: null };
  } catch (err) {
    return { category: null, error: err.message };
  }
}

/**
 * Check if any scraper is currently running.
 * Throws an error if another scraper is active.
 * A scraper is considered active if status is 'started' and it was created less than 30 minutes ago.
 */
export async function checkScraperConcurrency(client) {
  const result = await client.query(`
    SELECT id, vendor, created_at 
    FROM scrape_events 
    WHERE status = 'started' 
    AND created_at > (CURRENT_TIMESTAMP - INTERVAL '30 minutes')
    ORDER BY created_at DESC 
    LIMIT 1
  `);

  if (result.rows.length > 0) {
    const active = result.rows[0];
    const startTime = new Date(active.created_at).toLocaleTimeString();
    throw new Error(`Another scraper (${active.vendor}) is already running (started at ${startTime}). Please wait for it to finish or stop it before starting a new one.`);
  }
}

/**
 * Stop all running scrapers by killing browser processes and updating database status.
 */
export async function stopAllScrapers(client) {
  logger.info('[Scraper Utils] Stopping all scrapers...');

  // 1. Mark all 'started' events as 'cancelled'
  const result = await client.query(`
    UPDATE scrape_events 
    SET status = 'cancelled', 
        message = 'Stopped by user',
        duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))
    WHERE status = 'started'
    RETURNING id
  `);

  logger.info({ count: result.rowCount }, '[Scraper Utils] Updated started events to cancelled');

  // 2. Kill Chromium/Chrome processes launched by the app
  // We look for processes with specific flags used by our scraper
  try {
    if (process.platform === 'darwin') {
      // macOS: target Chrome/Chromium with headless or automation flags
      await execAsync("pkill -f 'Google Chrome.*headless' || true");
      await execAsync("pkill -f 'Chromium.*headless' || true");
      await execAsync("pkill -f 'Chrome for Testing.*headless' || true");
      await execAsync("pkill -f 'Google Chrome.*remote-debugging-port=9223' || true");
      await execAsync("pkill -f 'Chrome for Testing.*remote-debugging-port=9223' || true");
    } else {
      // Linux/others
      await execAsync("pkill -f 'chromium.*headless' || true");
      await execAsync("pkill -f 'chrome.*headless' || true");
      await execAsync("pkill -f 'Chrome for Testing.*headless' || true");
    }
    logger.info('[Scraper Utils] Browser processes killed');
  } catch (err) {
    logger.error({ error: err.message }, '[Scraper Utils] Error killing browser processes');
  }
}

/**
 * Runs the scraper directly in the main process
 * @param {Object} client - DB Client (optional, required for smart scraping)
 * @param {Object} scraperOptions - Options for createScraper
 * @param {Object} credentials - Scraper credentials
 * @param {Function} onProgress - Progress callback
 */
export async function runScraper(client, scraperOptions, credentials, onProgress) {
  logger.info({ companyId: scraperOptions.companyId }, '[Scraper] Starting Direct Scrape');

  // Fix non-serializable options
  const startDate = new Date(scraperOptions.startDate);
  const logRequests = scraperOptions.logRequests ?? false;
  const isRateLimited = RATE_LIMITED_VENDORS.includes(scraperOptions.companyId);

  // Check if we should use smart scraping for Isracard/Amex
  const isSmartVendor = ['isracard', 'amex'].includes(scraperOptions.companyId);
  // For these vendors, we ALWAYS want to use the 3-phase smart scraping to avoid blocking
  // and ensure categories are fetched efficiently. We ignore the generic setting for them.
  const useSmartScraping = isSmartVendor && client;

  // Use a simpler config for Leumi (same as the package)
  const isLeumi = scraperOptions.companyId === 'leumi';

  let options = {
    ...scraperOptions,
    startDate,
    preparePage: isLeumi ? null : getPreparePage({
      companyId: scraperOptions.companyId,
      timeout: scraperOptions.timeout,
      isRateLimited,
      logRequests,
      onProgress,
      forceSlowMode: scraperOptions.forceSlowMode ?? false,
      skipInterception: scraperOptions.companyId === 'max'
    }),
  };

  if (useSmartScraping) {
    logger.info({ vendor: scraperOptions.companyId }, '[Scraper] Using Smart Hybrid Sweeping');
    // Disable built-in category fetching to avoid rate limits
    options.additionalTransactionInformation = false;

    // Vendor specific skip features
    if (scraperOptions.companyId === 'isracard' || scraperOptions.companyId === 'amex') {
      options.optInFeatures = ['isracard-amex:skipAdditionalTransactionInformation'];
    }

    options.preparePage = getPreparePage({
      companyId: scraperOptions.companyId,
      timeout: scraperOptions.timeout,
      isRateLimited,
      logRequests,
      onProgress,
      forceSlowMode: scraperOptions.forceSlowMode ?? false,
      skipInterception: true // CRITICAL: This solves the conflict while keeping logging/masking
    });
  }

  logger.info('[Scraper] Creating scraper instance');

  if (!options.companyId) {
    logger.error({ options }, '[Scraper] Missing companyId in options!');
    throw new Error(`Missing companyId in scraper options. Received: ${JSON.stringify(options)}`);
  }

  const scraper = createScraper(options);

  if (scraper && typeof scraper.on === 'function') {
    scraper.on('progress', (companyId, progress) => {
      logger.debug({ companyId, progressType: progress?.type || 'unknown' }, '[Scraper] Progress event');
      if (onProgress) onProgress(companyId, progress);
    });
  }

  // Monkey-patch terminate for smart scraping ONLY
  let originalTerminate = null;
  if (useSmartScraping) {
    originalTerminate = scraper.terminate.bind(scraper);
    scraper.terminate = async () => {
      logger.info('[Scraper] Prevented auto-termination for smart scraping phase');
      return;
    };
  }

  logger.info('[Scraper] Starting scrape execution');

  try {
    const result = await scraper.scrape(credentials);
    logger.info({ success: result?.success }, '[Scraper] Base scrape completed');

    if (result.success && result.accounts && !Array.isArray(result.accounts)) {
      result.accounts = [];
    }

    // --- PHASE 2 & 3: Smart Categorization ---
    if (useSmartScraping && result.success && result.accounts?.length > 0) {
      try {
        logger.info('[Scraper] Starting Phase 2: Local Categorization');

        // Load local data
        const cache = await loadCategoryCache(client);
        const rules = await loadCategorizationRules(client);

        const needsApiCall = [];
        let categorizedLocal = 0;

        for (const account of result.accounts) {
          const accountIdx = result.accounts.indexOf(account); // Needed for API call
          for (const txn of account.txns || []) {
            const desc = txn.description || '';

            // 1. Cache
            const cached = lookupCachedCategory(desc);
            if (cached && cached !== 'N/A') {
              txn.category = cached;
              categorizedLocal++;
              continue;
            }

            // 2. Rules
            const ruleMatch = matchCategoryRule(desc, rules);
            if (ruleMatch) {
              txn.category = ruleMatch.category;
              categorizedLocal++;
              continue;
            }

            // 3. Needs API
            needsApiCall.push({ txn, accountIndex: accountIdx });
          }
        }

        logger.info({ categorizedLocal, needsApi: needsApiCall.length }, '[Scraper] Phase 2 Complete');

        // Phase 3: Selective API calls (only for Isracard/Amex, not Leumi)
        const supportsCategoryAPI = scraperOptions.companyId === 'isracard' || scraperOptions.companyId === 'amex';
        if (supportsCategoryAPI && needsApiCall.length > 0 && scraper.page && !scraper.page.isClosed()) {
          logger.info('[Scraper] Starting Phase 3: Selective API Calls');

          // Deduplicate
          const uniqueMerchants = new Map();
          for (const item of needsApiCall) {
            if (!uniqueMerchants.has(item.txn.description)) {
              uniqueMerchants.set(item.txn.description, item);
            }
          }

          const MAX_CALLS = 200; // Increased for historical 12-month fetches
          let calls = 0;
          const DELAY = 3000;

          for (const [desc, item] of uniqueMerchants) {
            if (calls >= MAX_CALLS) break;
            calls++;

            // Calculate date param
            const txnDate = new Date(item.txn.date || item.txn.processedDate);
            const moedChiuv = `${String(txnDate.getMonth() + 1).padStart(2, '0')}${txnDate.getFullYear()}`;

            try {
              if (onProgress) {
                onProgress(scraperOptions.companyId, {
                  type: 'fetchingCategory',
                  message: `Fetching category: ${desc.substring(0, 20)}...`
                });
              }
              const { category } = await fetchCategoryFromIsracard(scraper.page, item.txn, item.accountIndex, moedChiuv);

              if (category) {
                // Apply to all matchers
                for (const t of needsApiCall) {
                  if (t.txn.description === desc) t.txn.category = category;
                }
              }

            } catch (e) {
              logger.warn({ error: e.message, desc }, '[Scraper] API Fetch failed');
            }

            await sleep(DELAY);
          }
          logger.info({ callsMade: calls }, '[Scraper] Phase 3 Complete');
        }
      } catch (smartError) {
        logger.error({ error: smartError.message }, '[Scraper] Smart scraping error (continuing with partial results)');
        // Don't fail the whole scrape if smart part fails
      } finally {
        // Manual termination
        if (originalTerminate) {
          logger.info('[Scraper] Terminating browser after smart scrape');
          await originalTerminate();
        }
      }
    }

    return result;
  } catch (err) {
    // ... existing error handling ...
    logger.error({
      error: err.message,
      stack: err.stack,
      name: err.name,
      vendor: scraperOptions.companyId
    }, '[Scraper] Fatal error during scrape');

    // Ensure we close if error happened during smart scrape
    if (originalTerminate) await originalTerminate();

    throw err;
  }
}

// Re-export specific settings helpers


export async function getFetchCategoriesSetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'fetch_categories_from_scrapers'");
  return result.rows.length > 0 ? result.rows[0].value === true || result.rows[0].value === 'true' : true;
}

export async function getUpdateCategoryOnRescrapeSetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'update_category_on_rescrape'");
  return result.rows.length > 0 ? result.rows[0].value === true || result.rows[0].value === 'true' : false;
}

export async function getLogHttpRequestsSetting(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'scraper_log_http_requests'");
  return result.rows.length > 0 ? result.rows[0].value === true || result.rows[0].value === 'true' : false;
}

export async function getScraperTimeout(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'scraper_timeout'");
  return result.rows.length > 0 ? parseInt(result.rows[0].value) || 60000 : 60000;
}

export async function getBillingCycleStartDay(client) {
  const result = await client.query("SELECT value FROM app_settings WHERE key = 'billing_cycle_start_day'");
  return result.rows.length > 0 ? parseInt(result.rows[0].value) || 10 : 10;
}

/**
 * Consolidate transaction processing logic from scrape handlers
 */
export async function processScrapedAccounts({
  client,
  accounts,
  companyId,
  credentialId,
  categorizationRules,
  categoryMappings,
  billingCycleStartDay,
  updateCategoryOnRescrape,
  isBank,
  onTransactionProcessed = null,
  onAccountStarted = null
}) {
  const stats = {
    accounts: 0,
    transactions: 0,
    savedTransactions: 0,
    duplicateTransactions: 0,
    updatedTransactions: 0,
    bankTransactions: 0,
    cachedCategories: 0,
    skippedCards: 0,
    processedTransactions: []
  };

  if (!accounts || !Array.isArray(accounts)) return stats;
  stats.accounts = accounts.length;

  for (const account of accounts) {
    if (onAccountStarted && onAccountStarted(account) === false) break;

    const ownedByOther = await checkCardOwnership(client, account.accountNumber, companyId, credentialId);
    if (ownedByOther) {
      logger.info({ accountNumber: account.accountNumber, ownedBy: ownedByOther }, '[Card Ownership] Skipping card - already owned by another credential');
      stats.skippedCards++;
      continue;
    }

    await claimCardOwnership(client, account.accountNumber, companyId, credentialId);

    if (!account.txns || !Array.isArray(account.txns)) {
      logger.warn({
        accountNumber: account.accountNumber,
        txnsType: typeof account.txns
      }, '[Scraper] Account txns is not an array, skipping transactions');
      continue;
    }

    for (const txn of account.txns) {
      if (onTransactionProcessed && onTransactionProcessed(null, null, txn) === false) break;
      stats.transactions++;
      if (isBank) stats.bankTransactions++;

      const defaultCurrency = txn.originalCurrency || txn.chargedCurrency || 'ILS';
      const insertResult = await insertTransaction(
        client,
        txn,
        companyId,
        account.accountNumber,
        defaultCurrency,
        categorizationRules,
        updateCategoryOnRescrape,
        categoryMappings,
        isBank,
        billingCycleStartDay
      );

      const reportItem = {
        description: txn.description,
        amount: txn.chargedAmount || txn.originalAmount,
        currency: txn.chargedCurrency || txn.originalCurrency || 'ILS',
        date: txn.date,
        category: insertResult.newCategory || insertResult.category || (insertResult.duplicated ? (txn.category || 'Uncategorized') : 'Uncategorized'),
        source: insertResult.categorySource || 'scraper',
        rule: insertResult.ruleMatched,
        cardLast4: account.accountNumber,
        isUpdate: !!insertResult.updated,
        isDuplicate: !!insertResult.duplicated && !insertResult.updated,
        isBank: isBank
      };

      if (insertResult.updated) {
        stats.updatedTransactions++;
      } else if (insertResult.duplicated) {
        stats.duplicateTransactions++;
      } else {
        stats.savedTransactions++;
      }

      if (insertResult.categorySource === 'cache') stats.cachedCategories++;

      stats.processedTransactions.push(reportItem);

      if (onTransactionProcessed) {
        onTransactionProcessed(reportItem, insertResult);
      }
    }
  }

  return stats;
}
