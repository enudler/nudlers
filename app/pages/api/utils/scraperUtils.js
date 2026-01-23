/**
 * Shared Scraper Utilities
 * 
 * Consolidated functions used across scraper endpoints:
 * - scrape.js
 * - scrape_stream.js
 */

import {
  BANK_VENDORS,
  APP_SETTINGS_KEYS,
  FETCH_SETTING_SQL,
  DEFAULT_SCRAPER_TIMEOUT,
  DEFAULT_SCRAPE_RETRIES,
  SCRAPER_PHASE3_MAX_CALLS,
  SCRAPER_PHASE3_DELAY,
  SCRAPER_PHASE3_BATCH_SIZE,
  STANDARD_BANK_VENDORS,
  BEINLEUMI_GROUP_VENDORS,
  CREDIT_CARD_VENDORS,
  ALL_VENDORS
} from '../../../utils/constants.js';
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
  RATE_LIMITED_VENDORS,
  clearActiveSession
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
 * Reset category cache (for testing)
 */
export function resetCategoryCache() {
  categoryCache = null;
}

/**
 * Load category cache from database for known description -> category mappings
 * Builds cache from existing transactions if transaction_categories table doesn't exist
 */
export async function loadCategoryCache(client) {
  if (categoryCache !== null) return categoryCache;

  categoryCache = {};

  // 1. Always try to build recent history cache first (Implicit Knowledge)
  try {
    const historyResult = await client.query(
      `SELECT name, category FROM (
        SELECT name, category, MAX(date) as last_seen 
        FROM transactions 
        WHERE category IS NOT NULL 
          AND category != '' 
          AND category != 'N/A'
          AND LOWER(category) != 'uncategorized'
          AND (transaction_type IS NULL OR transaction_type != 'bank')
          AND date >= CURRENT_DATE - INTERVAL '120 days'
        GROUP BY name, category
      ) t ORDER BY last_seen DESC LIMIT 300`
    );

    for (const row of historyResult.rows) {
      if (row.name && row.category) {
        categoryCache[row.name.toLowerCase()] = row.category;
      }
    }
    logger.info({ count: Object.keys(categoryCache).length }, '[Category Cache] Built recent-merchants cache from transactions');
  } catch (err) {
    logger.warn({ error: err.message }, '[Category Cache] Failed to load transaction history');
  }

  // 2. Load explicit/manual overrides from transaction_categories if it exists (Explicit Knowledge)
  try {
    const result = await client.query(
      `SELECT description, category FROM transaction_categories`
    );

    let explicitCount = 0;
    for (const row of result.rows) {
      // Filter out uncategorized, empty, and N/A categories
      if (row.description && row.category &&
        row.category !== 'N/A' &&
        row.category !== '' &&
        row.category.toLowerCase() !== 'uncategorized') {
        // Overwrite history with manual setting
        categoryCache[row.description.toLowerCase()] = row.category;
        explicitCount++;
      }
    }
    if (explicitCount > 0) {
      logger.info({ count: explicitCount }, '[Category Cache] Applied explicit category mappings');
    }
  } catch (err) {
    // Ignore if table doesn't exist, otherwise log error
    if (!err.message || !err.message.includes('does not exist')) {
      logger.error({ error: err.message }, '[Category Cache] Error loading transaction_categories');
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
    return res.rows.map(row => ({
      ...row,
      lowerPattern: row.name_pattern ? row.name_pattern.toLowerCase() : ''
    }));
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
    const pattern = rule.lowerPattern || (rule.name_pattern ? rule.name_pattern.toLowerCase() : null);
    if (pattern && lowerDesc.includes(pattern)) {
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
  if (!description) return null;
  if (!categoryCache) return null;
  return categoryCache[description.trim().toLowerCase()] || null;
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
    phoneNumber,
    ...rest
  } = rawCredentials;

  const credentials = { ...rest };

  if (vendor === 'hapoalim') {
    // Use userCode if provided, otherwise fall back to username/id/id_number
    const hapoalimUserCode = userCode || username || id || rawCredentials.id_number || '';
    credentials.userCode = String(hapoalimUserCode);
    credentials.password = String(password || '');
  } else if (vendor === 'oneZero') {
    credentials.email = username || id || '';
    credentials.password = password;
    credentials.phoneNumber = phoneNumber;
  } else if (STANDARD_BANK_VENDORS.includes(vendor) || BEINLEUMI_GROUP_VENDORS.includes(vendor) || vendor === 'igud' || vendor === 'massad' || vendor === 'discount') {
    // Standard bank login (username + password, sometimes num)
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
  } else if (vendor === 'oneZero') {
    if (!credentials.email || !credentials.password || !credentials.phoneNumber) {
      throw new Error(`Invalid credentials for ${vendor}: email, password and phoneNumber are required.`);
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
export async function insertTransaction(client, transaction, vendor, accountNumber, defaultCurrency, categorizationRules = [], updateCategoryOnRescrape = false, categoryMappings = {}, isBank = false, billingCycleStartDay = 10, historyCache = null) {
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
    category: scraperCategory,
    installments
  } = transaction;

  // Use either top-level or nested installments data
  const finalInstallmentsNumber = transaction.installmentsNumber || installments?.number || null;
  const finalInstallmentsTotal = transaction.installmentsTotal || installments?.total || null;

  // 1. Determine local categorization with correct priority
  // Priority: Rule > Cache > Scraper (for transactions without category)
  // Priority: Rule > Scraper (for transactions with category)

  let finalCategory = scraperCategory || null;
  if (finalCategory === 'N/A') finalCategory = null;

  let categorySource = finalCategory ? 'scraper' : null;
  let ruleDetails = null;

  // STEP 1: Check Rules (highest priority)
  if (categorizationRules?.length > 0) {
    const ruleMatch = matchCategoryRule(description, categorizationRules);
    if (ruleMatch) {
      finalCategory = ruleMatch.category;
      categorySource = 'rule';
      ruleDetails = ruleMatch.match;
    }
  }

  // STEP 2: Check Cache
  // Priority depends on vendor:
  // - Isracard/Amex: Cache > Scraper (Cache overrides scraper)
  // - Others: Scraper > Cache (Cache used only if scraper is empty)
  if (categorySource !== 'rule') {
    const isIsracardOrAmex = vendor === 'isracard' || vendor === 'amex';
    const shouldCacheOverrideScraper = isIsracardOrAmex;

    const historyCached = historyCache?.nameToCategory?.get(description.toLowerCase());
    const globalCached = lookupCachedCategory(description);
    const cachedCategory = historyCached || globalCached;

    if (cachedCategory && cachedCategory !== 'N/A') {
      // Use cache if:
      // 1. We are allowed to override scraper (Isracard/Amex)
      // 2. OR we don't have a category yet (Scraper returned null/empty)
      if (shouldCacheOverrideScraper || !finalCategory) {
        finalCategory = cachedCategory;
        categorySource = 'cache';
      }
    }
  }

  // STEP 3: Apply category mappings if needed
  if (finalCategory && categoryMappings && Object.keys(categoryMappings).length > 0) {
    const mappedCategory = applyCategoryMappings(finalCategory, categoryMappings);
    if (mappedCategory !== finalCategory) {
      finalCategory = mappedCategory;
    }
  }

  // 2. Identifier & Collision Check
  const txId = identifier || generateTransactionIdentifier(transaction, vendor, accountNumber);
  const newDateStr = new Date(date).toISOString().split('T')[0];

  let existingTx = null;
  const cachedTx = historyCache?.idMap.get(txId);

  if (cachedTx) {
    existingTx = {
      identifier: txId,
      name: cachedTx.name,
      price: cachedTx.price,
      date: cachedTx.date,
      category: cachedTx.category,
      category_source: cachedTx.category_source,
      installments_number: cachedTx.installments_number,
      installments_total: cachedTx.installments_total
    };
  } else {
    // Cache miss or too old - hit database
    const existing = await client.query(
      'SELECT identifier, name, price, date, category, category_source, installments_number, installments_total FROM transactions WHERE identifier = $1 AND vendor = $2',
      [txId, vendor]
    );
    if (existing.rows.length > 0) existingTx = existing.rows[0];
  }

  if (existingTx) {
    const normalizedDbName = (existingTx.name || '').trim().toLowerCase();
    const normalizedNewName = (description || '').trim().toLowerCase();
    const dbPrice = Math.abs(existingTx.price || 0);
    const newPrice = Math.abs(chargedAmount || originalAmount || 0);
    const dbDateStr = existingTx.date instanceof Date ? existingTx.date.toISOString().split('T')[0] : existingTx.date;

    const isCollision = (normalizedDbName !== normalizedNewName && !normalizedDbName.includes(normalizedNewName) && !normalizedNewName.includes(normalizedDbName)) ||
      (Math.abs(dbPrice - newPrice) > 0.01) ||
      (dbDateStr !== newDateStr);

    if (isCollision) {
      logger.warn({ txId, vendor, dbName: existingTx.name, newName: description }, '[Scraper] Identifier collision! Fallback ID.');
      const fallbackId = generateTransactionIdentifier(transaction, vendor, accountNumber);
      return insertTransaction(client, { ...transaction, identifier: fallbackId }, vendor, accountNumber, defaultCurrency, categorizationRules, updateCategoryOnRescrape, categoryMappings, isBank, billingCycleStartDay, historyCache);
    }

    // Check if we need to update category or installments
    let needsUpdate = false;
    let updateFields = [];
    let updateValues = [];
    let paramIdx = 1;

    // A. Update Category
    if (updateCategoryOnRescrape && finalCategory && finalCategory !== 'N/A' && finalCategory !== '') {
      const currentCategory = existingTx.category;
      const currentSource = existingTx.category_source;
      const isCurrentEmpty = !currentCategory || currentCategory === 'N/A' || currentCategory === '' || currentCategory.toLowerCase() === 'uncategorized';

      if ((isCurrentEmpty || (currentSource !== 'cache' && currentCategory !== finalCategory)) && currentCategory !== finalCategory) {
        needsUpdate = true;
        updateFields.push(`category = $${paramIdx++}`, `category_source = $${paramIdx++}`, `rule_matched = $${paramIdx++}`);
        updateValues.push(finalCategory, categorySource, ruleDetails);
      }
    }

    // B. Update Installments (if missing in DB but present in new data)
    if (finalInstallmentsTotal && (!existingTx.installments_total || existingTx.installments_total <= 1)) {
      needsUpdate = true;
      updateFields.push(`installments_number = $${paramIdx++}`, `installments_total = $${paramIdx++}`);
      updateValues.push(finalInstallmentsNumber, finalInstallmentsTotal);
    }

    if (needsUpdate) {
      updateValues.push(txId, vendor);
      await client.query(
        `UPDATE transactions SET ${updateFields.join(', ')} WHERE identifier = $${paramIdx++} AND vendor = $${paramIdx++}`,
        updateValues
      );
      return { success: true, duplicated: true, updated: true, newCategory: finalCategory, categorySource, oldCategory: existingTx.category };
    }

    return { success: true, duplicated: true, updated: false, category: existingTx.category, categorySource: existingTx.category_source };
  }

  const normalizedName = (description || '').trim().toLowerCase();
  const normalizedPrice = Math.abs(chargedAmount || originalAmount || 0);
  const finalPrice = chargedAmount || originalAmount || 0;
  const currentKey = `${newDateStr}|${normalizedName}|${normalizedPrice.toFixed(2)}|${accountNumber || ''}`;

  // 3. Business Key Check
  let businessMatch = null;
  if (historyCache?.businessKeys.has(currentKey)) {
    const cachedInfo = historyCache.businessKeys.get(currentKey);
    // Cached info doesn't have identifier/total, so we might still need a DB hit if we want to update
    if (finalInstallmentsTotal && (!cachedInfo.installments_total || cachedInfo.installments_total <= 1)) {
      // Intentional DB hit to get full info for update
    } else {
      return { success: true, duplicated: true, category: cachedInfo.category, categorySource: cachedInfo.category_source };
    }
  }

  const businessKeyCheck = await client.query(
    `SELECT identifier, category, category_source, installments_total FROM transactions WHERE vendor = $1 AND date = $2 AND LOWER(TRIM(name)) = $3 AND ABS(price) = $4 AND COALESCE(account_number, '') = $5`,
    [vendor, date, normalizedName, normalizedPrice, accountNumber || '']
  );
  if (businessKeyCheck.rows.length > 0) {
    const match = businessKeyCheck.rows[0];
    if (finalInstallmentsTotal && (!match.installments_total || match.installments_total <= 1)) {
      await client.query(
        `UPDATE transactions SET installments_number = $1, installments_total = $2 WHERE identifier = $3 AND vendor = $4`,
        [finalInstallmentsNumber, finalInstallmentsTotal, match.identifier, vendor]
      );
      return { success: true, duplicated: true, updated: true, category: match.category, categorySource: match.category_source };
    }
    return { success: true, duplicated: true, category: match.category, categorySource: match.category_source };
  }

  // 4. Installment Logic (Still DB-based as it is rarer and location-sensitive)
  if (finalInstallmentsTotal > 1) {
    const totalMatchCheck = await client.query(
      `SELECT identifier, category, category_source FROM transactions WHERE vendor = $1 AND ABS(date - $2) <= 1 AND LOWER(TRIM(name)) = $3 AND (ABS(price) = $4 OR ABS(original_amount) = $4) AND (installments_total IS NULL OR installments_total <= 1)`,
      [vendor, date, normalizedName, Math.abs(originalAmount || chargedAmount)]
    );
    if (totalMatchCheck.rows.length > 0) {
      const match = totalMatchCheck.rows[0];
      // Update installments if missing
      await client.query(
        `UPDATE transactions SET installments_number = $1, installments_total = $2 WHERE identifier = $3 AND vendor = $4`,
        [finalInstallmentsNumber, finalInstallmentsTotal, match.identifier, vendor]
      );
      return { success: true, duplicated: true, updated: true, newCategory: finalCategory, categorySource, oldCategory: match.category };
    }
  }

  // 5. Build Processed Date
  let finalProcessedDate = processedDate || date;
  if (!isBank && (!processedDate || new Date(processedDate).getTime() === new Date(date).getTime())) {
    const billingStartDay = billingCycleStartDay || 10;
    if (new Date(date).getDate() > billingStartDay) {
      const d = new Date(date);
      finalProcessedDate = new Date(d.getFullYear(), d.getMonth() + 1, billingStartDay).toISOString().split('T')[0];
    }
  }

  // 6. Final Insert
  const transactionType = isBank ? 'bank' : 'credit_card';
  try {
    await client.query(
      `INSERT INTO transactions (identifier, vendor, date, name, price, category, type, processed_date, original_amount, original_currency, charged_currency, memo, status, installments_number, installments_total, account_number, category_source, rule_matched, transaction_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) ON CONFLICT (identifier, vendor) DO NOTHING`,
      [txId, vendor, date, description || '', finalPrice, finalCategory, type, finalProcessedDate, originalAmount, originalCurrency, defaultCurrency, memo, status || 'completed', finalInstallmentsNumber, finalInstallmentsTotal, accountNumber, categorySource, ruleDetails, transactionType]
    );
    if (historyCache) {
      historyCache.idMap.set(txId, {
        name: description,
        price: finalPrice,
        date: newDateStr,
        category: finalCategory,
        category_source: categorySource,
        installments_number: finalInstallmentsNumber,
        installments_total: finalInstallmentsTotal
      });
      historyCache.businessKeys.set(currentKey, { category: finalCategory, category_source: categorySource });
    }
  } catch (err) {
    if (err.code === '23505') {
      // In case of race condition returning duplicate
      return { success: true, duplicated: true };
    }
    throw err;
  }

  return { success: true, duplicated: false, category: finalCategory, categorySource, ruleMatched: ruleDetails };

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
export async function updateScrapeAudit(client, auditId, status, message, report = null, retryCount = null, durationSeconds = null) {
  if (!auditId) return;

  // If durationSeconds is not provided but we have a report, try to extract it from report
  const finalDuration = durationSeconds ?? report?.durationSeconds ?? report?.duration_seconds ?? null;

  if (report) {
    await client.query(
      `UPDATE scrape_events 
       SET status = $1, 
           message = $2, 
           report_json = $3,
           duration_seconds = COALESCE($6, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))),
           retry_count = COALESCE($5, retry_count)
       WHERE id = $4`,
      [status, message, report, auditId, retryCount, finalDuration]
    );
  } else {
    await client.query(
      `UPDATE scrape_events 
       SET status = $1, 
           message = $2,
           duration_seconds = COALESCE($5, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))),
           retry_count = COALESCE($4, retry_count)
       WHERE id = $3`,
      [status, message, auditId, retryCount, finalDuration]
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
export async function runScraper(client, scraperOptions, credentials, onProgress, checkCancelled = null) {
  logger.info({ companyId: scraperOptions.companyId }, '[Scraper] Starting Direct Scrape');

  // Fix non-serializable options
  const startDate = new Date(scraperOptions.startDate);
  const logRequests = scraperOptions.logRequests ?? false;
  const isRateLimited = scraperOptions.isRateLimited ?? false;

  // Check if we should use smart scraping for Isracard/Amex
  const isSmartVendor = ['isracard', 'amex'].includes(scraperOptions.companyId);

  // For these vendors, we ALWAYS want to use the 3-phase smart scraping to avoid blocking
  // and ensure categories are fetched efficiently. We ignore the generic setting for them.
  const useSmartScraping = isSmartVendor && client;

  // Honor vendor-specific detailed category scraping setting if available
  const shouldFetchDetailedCategories = (isSmartVendor && client)
    ? await getIsracardScrapeCategoriesSetting(client)
    : true;

  let options = {
    ...scraperOptions,
    startDate,
    preparePage: getPreparePage({
      companyId: scraperOptions.companyId,
      timeout: scraperOptions.timeout,
      isRateLimited,
      logRequests,
      onProgress,
      forceSlowMode: scraperOptions.forceSlowMode ?? false,
      skipInterception: scraperOptions.skipInterception ?? false
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

  let scraper;
  if (options.companyId === 'visaCal') {
    const { default: CustomVisaCalScraper } = await import('../../../scrapers/CustomVisaCalScraper.js');
    // We need to manually initialize it similar to how createScraper does
    // createScraper code: return new Scraper(options);
    scraper = new CustomVisaCalScraper(options);
  } else {
    scraper = createScraper(options);
  }

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

  // Wrap the entire scrape process in a global timeout
  const globalTimeoutMs = options.timeout || DEFAULT_SCRAPER_TIMEOUT;

  const scrapePromise = scraper.scrape(credentials);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Scraping timed out after ${globalTimeoutMs}ms (full process limit reached)`));
    }, globalTimeoutMs);
  });

  try {
    // Race between the scrape process and the global timeout
    const result = await Promise.race([scrapePromise, timeoutPromise]);
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
          const accountIdx = (account.index !== undefined) ? account.index : result.accounts.indexOf(account);
          logger.info({ accountNumber: account.accountNumber, cardIndex: accountIdx }, '[Scraper] Processing account categorization');

          for (const txn of account.txns || []) {
            const desc = (txn.description || '').trim();

            // 1. Rules (highest priority)
            const ruleMatch = matchCategoryRule(desc, rules);
            if (ruleMatch) {
              logger.info({ desc, category: ruleMatch.category }, '[Scraper] Phase 2 Match: Rule');
              txn.category = ruleMatch.category;
              categorizedLocal++;
              continue;
            }

            // 2. Cache (second priority)
            const cached = lookupCachedCategory(desc);
            if (cached && cached !== 'N/A') {
              logger.info({ desc, category: cached }, '[Scraper] Phase 2 Match: Cache');
              txn.category = cached;
              categorizedLocal++;
              continue;
            }

            // 3. Needs API (lowest priority)
            needsApiCall.push({ txn, accountIndex: accountIdx });
          }
        }

        logger.info({ categorizedLocal, needsApi: needsApiCall.length }, '[Scraper] Phase 2 Complete');

        // Phase 3: Selective API calls (only for supported vendors)
        const supportsCategoryAPI = scraperOptions.companyId === 'isracard' || scraperOptions.companyId === 'amex';
        if (supportsCategoryAPI && shouldFetchDetailedCategories && needsApiCall.length > 0 && scraper.page && !scraper.page.isClosed()) {
          logger.info('[Scraper] Starting Phase 3: Selective API Calls');

          // Deduplicate
          const uniqueMerchants = new Map();
          for (const item of needsApiCall) {
            if (!uniqueMerchants.has(item.txn.description)) {
              uniqueMerchants.set(item.txn.description, item);
            }
          }

          const MAX_CALLS = SCRAPER_PHASE3_MAX_CALLS;
          let calls = 0;
          const DELAY = SCRAPER_PHASE3_DELAY;
          const BATCH_SIZE = SCRAPER_PHASE3_BATCH_SIZE;

          const merchantEntries = Array.from(uniqueMerchants.entries());

          for (let i = 0; i < merchantEntries.length && calls < MAX_CALLS; i += BATCH_SIZE) {
            if (checkCancelled && checkCancelled()) {
              logger.info('[Scraper] Phase 3 cancelled by user');
              break;
            }

            const chunk = merchantEntries.slice(i, i + BATCH_SIZE);

            await Promise.all(chunk.map(async ([desc, item]) => {
              // Calculate moedChiuv (billing month)
              // Prioritize processedDate as it usually represents the billing date in Isracard
              const billingDate = new Date(item.txn.processedDate || item.txn.date);
              const moedChiuv = `${String(billingDate.getMonth() + 1).padStart(2, '0')}${billingDate.getFullYear()}`;

              try {
                if (onProgress) {
                  onProgress(scraperOptions.companyId, {
                    type: 'fetchingCategory',
                    message: `Fetching category: ${desc.substring(0, 20)}...`
                  });
                }
                const { category } = await fetchCategoryFromIsracard(scraper.page, item.txn, item.accountIndex, moedChiuv);

                if (category) {
                  logger.info({ desc, category }, '[Scraper] Phase 3 Match: API');
                  // Apply to all matchers
                  for (const t of needsApiCall) {
                    if (t.txn.description === desc) t.txn.category = category;
                  }
                } else {
                  logger.debug({ desc }, '[Scraper] Phase 3: API returned no category');
                }
              } catch (e) {
                logger.warn({ error: e.message, desc }, '[Scraper] API Fetch failed');
              }
            }));

            calls += chunk.length;
            if (i + BATCH_SIZE < merchantEntries.length) {
              await sleep(DELAY);
            }
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

    clearActiveSession();
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
    clearActiveSession();

    throw err;
  }
}

// Re-export specific settings helpers


export async function getFetchCategoriesSetting(client) {
  const result = await client.query(FETCH_SETTING_SQL, [APP_SETTINGS_KEYS.FETCH_CATEGORIES]);
  return result.rows.length > 0 ? result.rows[0].value === true || result.rows[0].value === 'true' : true;
}

export async function getIsracardScrapeCategoriesSetting(client) {
  const result = await client.query(FETCH_SETTING_SQL, [APP_SETTINGS_KEYS.ISRACARD_SCRAPE_CATEGORIES]);
  return result.rows.length > 0 ? result.rows[0].value === true || result.rows[0].value === 'true' : true;
}

export async function getUpdateCategoryOnRescrapeSetting(client) {
  const result = await client.query(FETCH_SETTING_SQL, [APP_SETTINGS_KEYS.UPDATE_CATEGORY_ON_RESCRAPE]);
  return result.rows.length > 0 ? result.rows[0].value === true || result.rows[0].value === 'true' : false;
}

export async function getLogHttpRequestsSetting(client) {
  const result = await client.query(FETCH_SETTING_SQL, [APP_SETTINGS_KEYS.LOG_HTTP_REQUESTS]);
  return result.rows.length > 0 ? result.rows[0].value === true || result.rows[0].value === 'true' : false;
}

export async function getScraperTimeout(client) {
  const result = await client.query(FETCH_SETTING_SQL, [APP_SETTINGS_KEYS.SCRAPER_TIMEOUT]);
  if (result.rows.length === 0 || result.rows[0].value === null || result.rows[0].value === undefined || result.rows[0].value === '') {
    return DEFAULT_SCRAPER_TIMEOUT;
  }
  const val = parseInt(result.rows[0].value);
  return isNaN(val) ? DEFAULT_SCRAPER_TIMEOUT : val;
}

export async function getBillingCycleStartDay(client) {
  const result = await client.query(FETCH_SETTING_SQL, [APP_SETTINGS_KEYS.BILLING_CYCLE_START_DAY]);
  return result.rows.length > 0 ? parseInt(result.rows[0].value) || 10 : 10;
}

export async function getScrapeRetries(client) {
  const result = await client.query(FETCH_SETTING_SQL, [APP_SETTINGS_KEYS.SCRAPE_RETRIES]);
  const value = result.rows.length > 0 ? parseInt(result.rows[0].value) : DEFAULT_SCRAPE_RETRIES;

  // Validate: must be >= 0 and <= 10 (reasonable upper limit)
  if (isNaN(value) || value < 0) {
    logger.warn({ value }, '[Scraper Utils] Invalid scrape_retries value, using default');
    return DEFAULT_SCRAPE_RETRIES;
  }
  if (value > 10) {
    logger.warn({ value }, '[Scraper Utils] scrape_retries too high (max 10), capping at 10');
    return 10;
  }

  return value;
}



/**
 * Consolidate transaction processing logic from scrape handlers
 */
/**
 * Helper to warm up history cache (Identifiers + Business Keys) for a vendor.
 * Includes data from ALL cards to allow cross-card category matching while keeping deduplication per-card.
 */
async function fetchHistoryCache(client, vendor) {
  try {
    const result = await client.query(
      `SELECT identifier, name, price, date, category, category_source, account_number, installments_number, installments_total 
       FROM transactions 
       WHERE vendor = $1 
       AND date >= CURRENT_DATE - INTERVAL '120 days'
       ORDER BY date DESC LIMIT 3000`,
      [vendor]
    );

    const idMap = new Map(); // identifier -> { name, price, date, category, category_source, installments_number, installments_total }
    const businessKeys = new Map(); // date|name|price|account_number -> { category, category_source, installments_number, installments_total }
    const nameToCategory = new Map(); // name -> category (most recent)

    for (const row of result.rows) {
      const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0];
      const name = (row.name || '').trim().toLowerCase();
      const priceVal = Math.abs(row.price || 0);
      const priceStr = priceVal.toFixed(2);
      const accNum = row.account_number || '';

      const installmentInfo = {
        category: row.category,
        category_source: row.category_source,
        installments_number: row.installments_number,
        installments_total: row.installments_total
      };

      if (row.identifier) {
        idMap.set(row.identifier, {
          name,
          price: priceVal,
          date: dateStr,
          ...installmentInfo
        });
      }

      businessKeys.set(`${dateStr}|${name}|${priceStr}|${accNum}`, installmentInfo);

      // Build name -> category map (skipping uncategorized)
      if (row.category && row.category !== 'N/A' && row.category !== '' && row.category.toLowerCase() !== 'uncategorized' && !nameToCategory.has(name)) {
        nameToCategory.set(name, row.category);
      }
    }

    return { idMap, businessKeys, nameToCategory };
  } catch (err) {
    logger.error({ error: err.message, vendor }, '[History Cache] Failed to fetch history');
    return { idMap: new Map(), businessKeys: new Map(), nameToCategory: new Map() };
  }
}

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
    ruleCategories: 0,
    scraperCategories: 0,
    skippedCards: 0,
    processedTransactions: []
  };

  if (!accounts || !Array.isArray(accounts)) return stats;
  stats.accounts = accounts.length;

  // Ensure global category cache is loaded
  await loadCategoryCache(client);

  // Warm up history for ALL cards of this vendor (Identifier Map + Business Keys + Name-to-Category map)
  const historyCache = await fetchHistoryCache(client, companyId);

  try {
    await client.query('BEGIN');

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
          billingCycleStartDay,
          historyCache
        );

        const effectiveSource = insertResult.categorySource || 'scraper';

        const reportItem = {
          description: txn.description,
          amount: txn.chargedAmount || txn.originalAmount,
          currency: txn.chargedCurrency || txn.originalCurrency || 'ILS',
          date: txn.date,
          category: insertResult.newCategory || insertResult.category || (insertResult.duplicated ? (txn.category || 'Uncategorized') : 'Uncategorized'),
          source: effectiveSource,
          rule: insertResult.ruleMatched,
          cardLast4: account.accountNumber,
          isUpdate: !!insertResult.updated,
          isDuplicate: !!insertResult.duplicated && !insertResult.updated,
          isBank: isBank,
          oldCategory: insertResult.oldCategory
        };

        if (insertResult.updated) {
          stats.updatedTransactions++;
        } else if (insertResult.duplicated) {
          stats.duplicateTransactions++;
        } else {
          stats.savedTransactions++;
        }

        if (effectiveSource === 'cache') stats.cachedCategories++;
        else if (effectiveSource === 'rule') stats.ruleCategories++;
        else stats.scraperCategories++;

        stats.processedTransactions.push(reportItem);

        if (onTransactionProcessed) {
          onTransactionProcessed(reportItem, insertResult);
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    logger.error({ error: err.message }, '[Scraper Utils] Error in processScrapedAccounts, transaction rolled back');
    throw err;
  }

  return stats;
}
