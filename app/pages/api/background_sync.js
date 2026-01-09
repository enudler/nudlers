import { CompanyTypes, createScraper } from 'israeli-bank-scrapers';
import { getDB } from './db';
import { BANK_VENDORS } from '../../utils/constants';
import { withAuth } from './middleware/auth';
import { decrypt } from './utils/encryption';
import {
  RATE_LIMITED_VENDORS,
  loadCategoryCache,
  insertTransaction,
  checkCardOwnership,
  claimCardOwnership,
  prepareCredentials,
  getScraperOptions,
  getPreparePage,
  insertScrapeAudit,
  updateScrapeAudit,
  updateCredentialLastSynced,
  sleep,
  getVendorDelay,
} from './utils/scraperUtils';

async function scrapeAccount(client, account, startDate, cache = null) {
  const vendor = account.vendor;
  const companyId = CompanyTypes[vendor];
  
  if (!companyId) {
    throw new Error(`Invalid company ID: ${vendor}`);
  }

  const isBank = BANK_VENDORS.includes(vendor);
  const isIsracardAmex = RATE_LIMITED_VENDORS.includes(vendor);

  const scraperCredentials = prepareCredentials(vendor, account);

  // Add pre-scrape delay for rate-limited vendors
  if (RATE_LIMITED_VENDORS.includes(vendor)) {
    const preDelay = Math.floor(Math.random() * 5000) + 3000;
    console.log(`[Background Sync] Pre-scrape delay for ${vendor}: ${Math.round(preDelay/1000)}s`);
    await sleep(preDelay);
  }

  const scraperOptions = {
    ...getScraperOptions(companyId, startDate, isIsracardAmex),
    preparePage: getPreparePage(isIsracardAmex),
  };

  // Insert audit row
  const triggeredBy = account.nickname || account.username || account.id_number || 'background_sync';
  const auditId = await insertScrapeAudit(client, triggeredBy, vendor, startDate, 'Background sync initiated');

  const scraper = createScraper(scraperOptions);
  let result;
  
  try {
    result = await scraper.scrape(scraperCredentials);
  } catch (scrapeError) {
    await updateScrapeAudit(client, auditId, 'failed', scrapeError.message || 'Scraper exception');
    throw new Error(`Scraper exception for ${vendor}: ${scrapeError.message}`);
  }

  if (!result.success) {
    const errorMsg = result.errorMessage || result.errorType || 'Scraping failed';
    await updateScrapeAudit(client, auditId, 'failed', errorMsg);
    throw new Error(`${result.errorType || 'GENERIC'}: ${errorMsg}`);
  }

  let transactionCount = 0;
  let skippedCards = 0;
  
  for (const accountData of result.accounts) {
    const ownedByOther = await checkCardOwnership(client, vendor, accountData.accountNumber, account.id);
    
    if (ownedByOther) {
      console.log(`[Card Ownership] Skipping card ${accountData.accountNumber} - already owned by credential ${ownedByOther}`);
      skippedCards++;
      continue;
    }
    
    await claimCardOwnership(client, vendor, accountData.accountNumber, account.id);
    
    for (const txn of accountData.txns) {
      transactionCount++;
      await insertTransaction(txn, client, vendor, isBank, accountData.accountNumber, cache);
    }
  }
  
  if (skippedCards > 0) {
    console.log(`[Card Ownership] Skipped ${skippedCards} cards owned by other credentials`);
  }

  // Update audit as success
  await updateScrapeAudit(client, auditId, 'success', `Success: accounts=${result.accounts.length}, txns=${transactionCount}`);

  // Update last_synced_at
  await updateCredentialLastSynced(client, account.id);

  return {
    vendor,
    nickname: account.nickname,
    transactionCount,
    accountsCount: result.accounts.length
  };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { days = 30, delaySeconds = 10 } = req.body;

  // Validate parameters
  if (days < 1 || days > 365) {
    return res.status(400).json({ message: 'Days must be between 1 and 365' });
  }
  if (delaySeconds < 0 || delaySeconds > 300) {
    return res.status(400).json({ message: 'Delay must be between 0 and 300 seconds' });
  }

  const client = await getDB();
  
  try {
    // Get all active configured accounts
    const accountsResult = await client.query('SELECT * FROM vendor_credentials WHERE is_active = true ORDER BY vendor');
    const accounts = accountsResult.rows;

    if (accounts.length === 0) {
      return res.status(400).json({ message: 'No active accounts configured' });
    }

    // Decrypt credentials
    const decryptedAccounts = accounts.map(account => ({
      ...account,
      username: account.username ? decrypt(account.username) : null,
      password: account.password ? decrypt(account.password) : null,
      id_number: account.id_number ? decrypt(account.id_number) : null,
      card6_digits: account.card6_digits ? decrypt(account.card6_digits) : null,
    }));

    // Load category cache
    const cache = await loadCategoryCache(client);
    
    const today = new Date();
    const results = [];
    const errors = [];

    // Process each day
    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - dayOffset);
      targetDate.setHours(0, 0, 0, 0);

      console.log(`[Background Sync] Processing date: ${targetDate.toISOString().split('T')[0]}`);

      // Process each account for this day
      for (const account of decryptedAccounts) {
        try {
          console.log(`[Background Sync] Scraping ${account.vendor} (${account.nickname}) for ${targetDate.toISOString().split('T')[0]}`);
          
          const result = await scrapeAccount(client, account, targetDate, cache);
          results.push({
            date: targetDate.toISOString().split('T')[0],
            ...result,
            status: 'success'
          });
        } catch (error) {
          console.error(`[Background Sync] Error scraping ${account.vendor}:`, error.message);
          errors.push({
            date: targetDate.toISOString().split('T')[0],
            vendor: account.vendor,
            nickname: account.nickname,
            error: error.message,
            status: 'failed'
          });
        }

        // Wait between accounts with vendor-specific delays
        if (decryptedAccounts.indexOf(account) < decryptedAccounts.length - 1) {
          const nextAccount = decryptedAccounts[decryptedAccounts.indexOf(account) + 1];
          const actualDelay = getVendorDelay(nextAccount?.vendor || account.vendor, delaySeconds);
          console.log(`[Background Sync] Waiting ${actualDelay} seconds before next account...`);
          await sleep(actualDelay * 1000);
        }
      }

      // Wait between days
      if (dayOffset < days - 1) {
        const hasRateLimitedVendor = decryptedAccounts.some(a => RATE_LIMITED_VENDORS.includes(a.vendor));
        const dayDelay = hasRateLimitedVendor ? Math.max(delaySeconds, 30) : delaySeconds;
        if (dayDelay > 0) {
          console.log(`[Background Sync] Waiting ${dayDelay} seconds before next day...`);
          await sleep(dayDelay * 1000);
        }
      }
    }

    const totalTransactions = results.reduce((sum, r) => sum + (r.transactionCount || 0), 0);

    res.status(200).json({
      message: 'Background sync completed',
      summary: {
        totalDays: days,
        totalAccounts: accounts.length,
        totalTransactions,
        successfulScrapes: results.length,
        failedScrapes: errors.length
      },
      results,
      errors
    });

  } catch (error) {
    console.error('Background sync failed:', error);
    res.status(500).json({
      message: 'Background sync failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    client.release();
  }
}

export default withAuth(handler);
