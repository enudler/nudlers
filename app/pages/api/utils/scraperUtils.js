/**
 * Shared Scraper Utilities
 * 
 * Consolidated functions used across scraper endpoints:
 * - scrape.js
 * - scrape_stream.js
 */

import { BANK_VENDORS, BEINLEUMI_GROUP_VENDORS } from '../../../utils/constants';
import { generateTransactionIdentifier } from './transactionUtils';

// Vendors that are known to have rate limiting issues
// Max uses the same base scraper as Isracard/Amex (base-isracard-amex.js)
// VisaCal also experiences rate limiting and JSON parsing errors
export const RATE_LIMITED_VENDORS = ['isracard', 'amex', 'max', 'visaCal'];

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
 * Normalize a date to local date string (YYYY-MM-DD) to handle timezone issues
 * This ensures consistent date handling regardless of when the scrape runs
 */
function normalizeDate(dateInput) {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  // Use local date components to avoid timezone shifts
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a similar transaction already exists within a 1-day window
 * This catches timezone-related duplicates where dates are off by 1 day
 */
async function checkForExistingTransaction(client, companyId, txn, amount, accountNumber) {
  const txnDate = new Date(txn.date);
  const result = await client.query(`
    SELECT identifier, date, processed_date 
    FROM transactions 
    WHERE vendor = $1 
      AND LOWER(TRIM(name)) = LOWER(TRIM($2))
      AND ABS(price) = ABS($3)
      AND COALESCE(account_number, '') = COALESCE($4, '')
      AND ABS(date - $5::date) <= 1
    LIMIT 1
  `, [companyId, txn.description, amount, accountNumber || '', txnDate]);
  
  return result.rows.length > 0 ? result.rows[0] : null;
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

  // Pre-insert check: Look for existing transactions within 1-day window (timezone duplicates)
  const existingTxn = await checkForExistingTransaction(client, companyId, txn, amount, accountNumber);
  if (existingTxn) {
    // Update the existing transaction's processed_date if we have a newer one
    if (txn.processedDate && (!existingTxn.processed_date || new Date(txn.processedDate) > new Date(existingTxn.processed_date))) {
      await client.query(`
        UPDATE transactions 
        SET processed_date = $1
        WHERE identifier = $2 AND vendor = $3
      `, [txn.processedDate, existingTxn.identifier, companyId]);
    }
    return { inserted: false, reason: 'duplicate_within_1_day', existingIdentifier: existingTxn.identifier };
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
 * @param {Object} scraperCredentials - The credentials object
 * @param {string} vendor - The vendor name (for vendor-specific validation)
 */
export function validateCredentials(scraperCredentials, vendor = null) {
  for (const [key, value] of Object.entries(scraperCredentials)) {
    if (typeof value !== 'string') {
      throw new Error(`Credential ${key} must be a string, got ${typeof value}`);
    }
    if (value === 'undefined' || value === 'null') {
      throw new Error(`Credential ${key} has invalid value`);
    }
  }
  
  // Vendor-specific validation
  if (vendor === 'isracard' || vendor === 'amex') {
    // Isracard and Amex REQUIRE id, card6Digits, and password
    if (!scraperCredentials.id || scraperCredentials.id.trim() === '') {
      throw new Error('ID number is required for Isracard/Amex');
    }
    if (!scraperCredentials.card6Digits || scraperCredentials.card6Digits.trim() === '') {
      throw new Error('Card 6 digits is required for Isracard/Amex login');
    }
    if (!scraperCredentials.password || scraperCredentials.password.trim() === '') {
      throw new Error('Password is required');
    }
    console.log(`[Isracard Validation] id: ${scraperCredentials.id.length} chars, card6Digits: ${scraperCredentials.card6Digits.length} chars, password: ${scraperCredentials.password.length} chars`);
  } else if (vendor === 'max' || vendor === 'visaCal') {
    // Max and VisaCal REQUIRE username and password
    if (!scraperCredentials.username || scraperCredentials.username.trim() === '') {
      throw new Error('Username is required for Max/VisaCal');
    }
    if (!scraperCredentials.password || scraperCredentials.password.trim() === '') {
      throw new Error('Password is required for Max/VisaCal');
    }
    console.log(`[Max/VisaCal Validation] username: ${scraperCredentials.username.length} chars, password: ${scraperCredentials.password.length} chars`);
  }
}

/**
 * Get a boolean setting from the database
 * @param {Object} client - Optional database client (if provided, won't release it)
 * @param {string} key - The setting key to fetch
 * @param {boolean} defaultValue - Default value if setting doesn't exist
 */
async function getBooleanSetting(client, key, defaultValue = false) {
  let dbClient = client;
  let shouldRelease = false;
  
  try {
    if (!dbClient) {
      const { getDB } = await import('../db.js');
      dbClient = await getDB();
      shouldRelease = true;
    }
    
    const result = await dbClient.query(
      `SELECT value FROM app_settings WHERE key = $1`,
      [key]
    );
    
    if (result.rows.length > 0) {
      const value = result.rows[0].value;
      // Handle JSONB value (could be string "true"/"false" or boolean)
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        return value === 'true' || value === '"true"';
      }
      // If it's JSON parsed, it might be a boolean already
      return value === true;
    }
    
    // Return default if setting doesn't exist
    return defaultValue;
  } catch (error) {
    console.error(`[Scraper Utils] Error getting ${key} setting:`, error);
    // Return default on error
    return defaultValue;
  } finally {
    if (shouldRelease && dbClient) {
      dbClient.release();
    }
  }
}

/**
 * Get the show_browser setting from database
 * This is async and should be called before getScraperOptions if you need the setting
 * @param {Object} client - Optional database client (if provided, won't release it)
 */
export async function getShowBrowserSetting(client = null) {
  return getBooleanSetting(client, 'show_browser', false);
}

/**
 * Get the fetch_categories_from_scrapers setting from database
 * When false, the scraper won't fetch categories from card providers (reduces rate limiting)
 * Local category cache will still be used to assign categories
 * @param {Object} client - Optional database client (if provided, won't release it)
 */
export async function getFetchCategoriesSetting(client = null) {
  return getBooleanSetting(client, 'fetch_categories_from_scrapers', true);
}

/**
 * Get base scraper options with anti-detection measures
 * @param {string} companyId - The company/vendor ID
 * @param {Date} startDate - Start date for scraping
 * @param {boolean} isIsracardAmex - Whether this is a rate-limited vendor
 * @param {Object} options - Additional options
 * @param {boolean} options.showBrowser - Show browser window for debugging/2FA (default: false - respects app setting)
 * @param {boolean} options.verbose - Enable verbose logging (default: true)
 * @param {boolean} options.fetchCategories - Fetch categories from card providers (default: true)
 */
export function getScraperOptions(companyId, startDate, isIsracardAmex, options = {}) {
  // Default to false - browser should only show if explicitly enabled via setting or option
  // The setting will be checked by the caller before calling this function
  const showBrowser = options.showBrowser ?? false;
  
  // additionalTransactionInformation fetches categories from card providers
  // Disabling this reduces API calls and helps avoid rate limiting
  // Default to true for backwards compatibility
  const fetchCategories = options.fetchCategories ?? true;
  
  // Latest Chrome version user agent (updated January 2026)
  const chromeVersion = '132.0.6834.83';
  const userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  
  // Base Chrome args for headless/anti-detection
  const baseArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--window-size=1920,1080',
    '--disable-web-security',
    `--user-agent=${userAgent}`,
    '--disable-infobars',
    '--disable-extensions',
    '--lang=he-IL,he,en-US,en',
    // Additional anti-detection flags
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--password-store=basic',
    '--use-mock-keychain',
  ];
  
  // Add remote debugging port when showing browser (useful for debugging)
  if (showBrowser) {
    baseArgs.push('--remote-debugging-port=9222');
    baseArgs.push('--remote-debugging-address=0.0.0.0');
  }
  
  // For rate-limited vendors (isracard, amex, max, visaCal), use longer timeouts
  // VisaCal needs longer timeout due to API issues (JSON parsing errors, GetFrameStatus)
  // All rate-limited vendors get 240s timeout to handle slow responses and rate limiting
  const timeout = isIsracardAmex ? 240000 : 120000;
  
  console.log(`[Scraper Options] vendor=${companyId}, showBrowser=${showBrowser}, isRateLimited=${isIsracardAmex}, fetchCategories=${fetchCategories}, timeout=${timeout}ms`);
  
  return {
    companyId,
    startDate,
    combineInstallments: false,
    additionalTransactionInformation: fetchCategories,
    showBrowser,
    verbose: options.verbose ?? true,
    timeout,
    executablePath: getChromePath(),
    args: baseArgs,
    viewportSize: { width: 1920, height: 1080 },
    defaultTimeout: timeout,
    ...options
  };
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
 * Get preparePage function with anti-detection measures
 * @param {boolean} isIsracardAmex - True for rate-limited vendors (isracard, amex, max, visaCal)
 */
export function getPreparePage(isIsracardAmex) {
  return async (page) => {
    const randomDelay = (min, max) => new Promise(resolve => 
      setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
    );

    console.log(`[PreparePage] Setting up anti-detection measures (isRateLimited=${isIsracardAmex})`);

    // Longer initial delay for rate-limited vendors (isracard, amex, max, visaCal)
    if (isIsracardAmex) {
      const delay = Math.floor(Math.random() * 3000) + 2000;
      console.log(`[PreparePage] Adding initial delay of ${delay}ms for rate-limited vendor`);
      await randomDelay(2000, 5000);
    }

    // Override navigator properties to hide automation
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      // Delete webdriver from prototype
      try {
        delete Object.getPrototypeOf(navigator).webdriver;
      } catch (e) {}
      
      // Add realistic plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const pluginData = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
          ];
          const plugins = pluginData.map(p => {
            const plugin = Object.create(Plugin.prototype);
            Object.defineProperties(plugin, {
              name: { value: p.name },
              filename: { value: p.filename },
              description: { value: p.description },
              length: { value: 0 },
            });
            return plugin;
          });
          const pluginArray = Object.create(PluginArray.prototype);
          plugins.forEach((p, i) => {
            pluginArray[i] = p;
          });
          Object.defineProperty(pluginArray, 'length', { value: plugins.length });
          return pluginArray;
        },
      });
      
      Object.defineProperty(navigator, 'languages', { get: () => ['he-IL', 'he', 'en-US', 'en'] });
      
      // Mock permissions API
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Add chrome object to look like a real browser
      window.chrome = { 
        runtime: { 
          id: undefined,
          connect: () => {},
          sendMessage: () => {},
          onMessage: { addListener: () => {} },
          onConnect: { addListener: () => {} },
        },
        loadTimes: () => ({
          commitLoadTime: Date.now() / 1000 - Math.random() * 10,
          connectionInfo: 'h2',
          finishDocumentLoadTime: Date.now() / 1000 - Math.random() * 5,
          finishLoadTime: Date.now() / 1000 - Math.random() * 2,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: Date.now() / 1000 - Math.random() * 8,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          requestTime: Date.now() / 1000 - Math.random() * 12,
          startLoadTime: Date.now() / 1000 - Math.random() * 11,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
        }),
        csi: () => ({
          onloadT: Date.now() - Math.floor(Math.random() * 1000),
          startE: Date.now() - Math.floor(Math.random() * 5000),
          pageT: Math.floor(Math.random() * 3000),
        }),
        app: {
          isInstalled: false,
          InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
          RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        },
      };
      
      // Set realistic hardware properties
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
      Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
      Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
      Object.defineProperty(navigator, 'productSub', { get: () => '20030107' });
      
      // Override WebGL to prevent fingerprinting detection
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.call(this, parameter);
      };
      
      // Prevent detection via toString
      const originalFunction = Function.prototype.toString;
      Function.prototype.toString = function() {
        if (this === Function.prototype.toString) {
          return 'function toString() { [native code] }';
        }
        return originalFunction.call(this);
      };
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
      'Sec-CH-UA': '"Chromium";v="132", "Google Chrome";v="132", "Not-A.Brand";v="99"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"macOS"',
      'Upgrade-Insecure-Requests': '1',
    });

    // Add delays for rate-limited vendors
    if (isIsracardAmex) {
      const originalGoto = page.goto.bind(page);
      page.goto = async (url, options) => {
        const delay = Math.floor(Math.random() * 2500) + 1500;
        console.log(`[PreparePage] Navigating to ${url} with ${delay}ms delay`);
        await randomDelay(1500, 4000);
        return originalGoto(url, options);
      };
    }
    
    console.log('[PreparePage] Anti-detection setup complete');
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
