/**
 * Shared Scraper Utilities
 * 
 * Consolidated functions used across scraper endpoints:
 * - scrape.js
 * - scrape_stream.js
 * - background_sync.js
 * - catchup_sync.js
 * - scheduled_sync.js
 */

import { BANK_VENDORS, BEINLEUMI_GROUP_VENDORS } from '../../../utils/constants';
import { generateTransactionIdentifier } from './transactionUtils';

// Vendors that are known to have rate limiting issues
// Max uses the same base scraper as Isracard/Amex (base-isracard-amex.js)
export const RATE_LIMITED_VENDORS = ['isracard', 'amex', 'max'];

// Cache for description -> category mappings from our database
let categoryCache = null;

/**
 * Load category cache from database for known description -> category mappings
 */
export async function loadCategoryCache(client) {
  if (categoryCache !== null) return categoryCache;
  
  try {
    const result = await client.query(`
      SELECT DISTINCT LOWER(name) as name, category
      FROM transactions
      WHERE category IS NOT NULL 
        AND category != 'N/A'
        AND category != ''
      ORDER BY name
    `);
    
    categoryCache = new Map();
    for (const row of result.rows) {
      categoryCache.set(row.name, row.category);
    }
    
    console.log(`[Category Cache] Loaded ${categoryCache.size} known description -> category mappings`);
    return categoryCache;
  } catch (error) {
    console.error('Error loading category cache:', error);
    return new Map();
  }
}

/**
 * Clear the category cache (useful for testing or forced refresh)
 */
export function clearCategoryCache() {
  categoryCache = null;
}

/**
 * Look up a category from the cache based on description
 */
export function lookupCachedCategory(description, cache) {
  if (!cache || !description) return null;
  return cache.get(description.toLowerCase()) || null;
}

/**
 * Insert a transaction into the database with duplicate handling
 */
export async function insertTransaction(txn, client, companyId, isBank, accountNumber = null, cache = null) {
  const identifier = generateTransactionIdentifier(txn, companyId, accountNumber);

  let amount = txn.chargedAmount ?? txn.originalAmount;
  let category = txn.category;
  
  if (!isBank) {
    amount = Math.abs(amount) * -1; // Credit card expenses are negative
    
    // If no category from scraper, try to find it in our cache
    if (!category || category === 'N/A' || category === '') {
      const cachedCategory = lookupCachedCategory(txn.description, cache);
      if (cachedCategory) {
        category = cachedCategory;
      }
    }
  } else {
    category = "Bank";
  }

  try {
    await client.query(
      `INSERT INTO transactions (
        identifier,
        vendor,
        date,
        name,
        price,
        category,
        type,
        processed_date,
        original_amount,
        original_currency,
        charged_currency,
        memo,
        status,
        installments_number,
        installments_total,
        account_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (identifier, vendor) DO UPDATE SET
        processed_date = COALESCE(EXCLUDED.processed_date, transactions.processed_date),
        category = CASE 
          WHEN transactions.category IN ('N/A', '') OR transactions.category IS NULL 
          THEN EXCLUDED.category 
          ELSE transactions.category 
        END`,
      [
        identifier,
        companyId,
        new Date(txn.date),
        txn.description,
        amount,
        category || 'N/A',
        txn.type,
        txn.processedDate,
        txn.originalAmount,
        txn.originalCurrency,
        txn.chargedCurrency,
        txn.memo,
        txn.status,
        txn.installments?.number,
        txn.installments?.total,
        accountNumber
      ]
    );
    return { inserted: true, identifier };
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'idx_transactions_business_key') {
      console.log(`[Duplicate Prevention] Skipped duplicate: ${txn.description} on ${txn.date}`);
      return { inserted: false, reason: 'duplicate_business_key', identifier };
    }
    console.error("Error inserting transaction:", error);
    throw error;
  }
}

/**
 * Check if a card (account_number) is owned by a different credential
 * Returns the owning credential_id if owned by someone else, null if available
 */
export async function checkCardOwnership(client, vendor, accountNumber, credentialId) {
  if (!accountNumber || !credentialId) return null;
  
  const result = await client.query(
    `SELECT credential_id FROM card_ownership WHERE vendor = $1 AND account_number = $2`,
    [vendor, accountNumber]
  );
  
  if (result.rows.length === 0) {
    return null; // Card not owned by anyone
  }
  
  const ownerId = result.rows[0].credential_id;
  return ownerId !== credentialId ? ownerId : null;
}

/**
 * Claim ownership of a card for a credential
 */
export async function claimCardOwnership(client, vendor, accountNumber, credentialId) {
  if (!accountNumber || !credentialId) return;
  
  try {
    await client.query(
      `INSERT INTO card_ownership (vendor, account_number, credential_id) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (vendor, account_number) DO NOTHING`,
      [vendor, accountNumber, credentialId]
    );
  } catch (error) {
    console.error("Error claiming card ownership:", error);
    // Don't throw - ownership claim failure shouldn't stop scraping
  }
}

/**
 * Apply categorization rules to transactions
 */
export async function applyCategorizationRules(client) {
  try {
    const rulesResult = await client.query(`
      SELECT id, name_pattern, target_category
      FROM categorization_rules
      WHERE is_active = true
      ORDER BY id
    `);
    
    const rules = rulesResult.rows;
    let totalUpdated = 0;
    
    for (const rule of rules) {
      const pattern = `%${rule.name_pattern}%`;
      const updateResult = await client.query(`
        UPDATE transactions 
        SET category = $2
        WHERE LOWER(name) LIKE LOWER($1) 
        AND category != $2
        AND category IS NOT NULL
        AND category != 'Bank'
        AND category != 'Income'
      `, [pattern, rule.target_category]);
      
      totalUpdated += updateResult.rowCount;
    }
    
    console.log(`Applied ${rules.length} rules to ${totalUpdated} transactions`);
    return { rulesApplied: rules.length, transactionsUpdated: totalUpdated };
  } catch (error) {
    console.error('Error applying categorization rules:', error);
    throw error;
  }
}

/**
 * Get Chrome/Chromium executable path based on environment
 */
export function getChromePath() {
  // Check for environment variable first (Docker)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  
  // Auto-detect based on platform
  const platform = process.platform;
  if (platform === 'linux') {
    return '/usr/bin/chromium'; // Docker/Linux default
  } else if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; // macOS
  } else if (platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'; // Windows
  }
  
  // Let puppeteer auto-detect
  return undefined;
}

/**
 * Prepare credentials based on vendor type
 */
export function prepareCredentials(vendor, credentials) {
  if (vendor === 'visaCal' || vendor === 'max') {
    return {
      username: String(credentials.username || ''),
      password: String(credentials.password || '')
    };
  } else if (BEINLEUMI_GROUP_VENDORS.includes(vendor)) {
    const bankUsername = credentials.username || credentials.id || credentials.id_number || '';
    return {
      username: String(bankUsername),
      password: String(credentials.password || '')
    };
  } else if (vendor === 'hapoalim') {
    const userCode = credentials.username || credentials.id || credentials.userCode || credentials.id_number || '';
    return {
      userCode: String(userCode),
      password: String(credentials.password || '')
    };
  } else if (BANK_VENDORS.includes(vendor)) {
    const bankId = credentials.username || credentials.id || credentials.id_number || '';
    const bankNum = credentials.bankAccountNumber || credentials.bank_account_number || '';
    return {
      id: String(bankId),
      password: String(credentials.password || ''),
      num: String(bankNum)
    };
  } else {
    // Credit cards (isracard, amex, etc.)
    return {
      id: String(credentials.id || credentials.id_number || credentials.username || ''),
      card6Digits: String(credentials.card6Digits || credentials.card6_digits || ''),
      password: String(credentials.password || '')
    };
  }
}

/**
 * Validate that all credential values are strings and not undefined
 */
export function validateCredentials(scraperCredentials) {
  for (const [key, value] of Object.entries(scraperCredentials)) {
    if (typeof value !== 'string') {
      throw new Error(`Credential ${key} must be a string, got ${typeof value}`);
    }
    if (value === 'undefined' || value === 'null') {
      throw new Error(`Credential ${key} has invalid value`);
    }
  }
}

/**
 * Get base scraper options with anti-detection measures
 * @param {string} companyId - The company/vendor ID
 * @param {Date} startDate - Start date for scraping
 * @param {boolean} isIsracardAmex - Whether this is a rate-limited vendor
 * @param {Object} options - Additional options
 * @param {boolean} options.showBrowser - Show browser window for debugging/2FA (default: false)
 * @param {boolean} options.verbose - Enable verbose logging (default: true)
 */
export function getScraperOptions(companyId, startDate, isIsracardAmex, options = {}) {
  const showBrowser = options.showBrowser ?? false;
  
  // Base Chrome args for headless/anti-detection
  const baseArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--window-size=1920,1080',
    '--disable-web-security',
    '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    '--disable-infobars',
    '--disable-extensions',
    '--lang=he-IL,he,en-US,en'
  ];
  
  // Add remote debugging port when showing browser (useful for debugging)
  if (showBrowser) {
    baseArgs.push('--remote-debugging-port=9222');
    baseArgs.push('--remote-debugging-address=0.0.0.0');
  }
  
  return {
    companyId,
    startDate,
    combineInstallments: false,
    additionalTransactionInformation: true,
    showBrowser,
    verbose: options.verbose ?? true,
    timeout: isIsracardAmex ? 180000 : 120000,
    executablePath: getChromePath(),
    args: baseArgs,
    viewportSize: { width: 1920, height: 1080 },
    defaultTimeout: isIsracardAmex ? 180000 : 120000,
    ...options
  };
}

/**
 * Get preparePage function with anti-detection measures
 */
export function getPreparePage(isIsracardAmex) {
  return async (page) => {
    const randomDelay = (min, max) => new Promise(resolve => 
      setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
    );

    // Longer initial delay for rate-limited vendors
    if (isIsracardAmex) {
      await randomDelay(2000, 5000);
    }

    // Override navigator properties to hide automation
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete navigator.__proto__.webdriver;
      
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ],
      });
      Object.defineProperty(navigator, 'languages', { get: () => ['he-IL', 'he', 'en-US', 'en'] });
      
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      window.chrome = { 
        runtime: { id: 'random-extension-id', connect: () => {}, sendMessage: () => {} },
        loadTimes: () => ({}),
        csi: () => ({})
      };
      
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
      Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    });

    // Set extra HTTP headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    });

    // Add delays for rate-limited vendors
    if (isIsracardAmex) {
      const originalGoto = page.goto.bind(page);
      page.goto = async (url, options) => {
        await randomDelay(1500, 4000);
        return originalGoto(url, options);
      };
    }
  };
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
 * Sleep helper
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
