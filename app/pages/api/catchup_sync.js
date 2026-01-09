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
  formatLocalDate,
} from './utils/scraperUtils';

/**
 * Catchup Sync API
 * 
 * For each configured account:
 * 1. Finds the last transaction date in the database
 * 2. Fetches transactions starting from 1 week before that date
 * 3. Streams progress updates via Server-Sent Events
 */

async function getLastTransactionDateForVendor(client, vendor) {
  const result = await client.query(`
    SELECT MAX(date) as last_date 
    FROM transactions 
    WHERE vendor = $1
  `, [vendor]);
  
  return result.rows[0]?.last_date || null;
}

async function scrapeAccount(client, account, startDate, sendEvent, cache = null) {
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
    sendEvent({ 
      type: 'delay', 
      vendor, 
      nickname: account.nickname,
      message: `Waiting ${Math.round(preDelay/1000)}s to avoid rate limiting...` 
    });
    await sleep(preDelay);
  }

  const scraperOptions = {
    ...getScraperOptions(companyId, startDate, isIsracardAmex),
    preparePage: getPreparePage(isIsracardAmex),
  };

  // Insert audit row
  const triggeredBy = account.nickname || account.username || account.id_number || 'catchup_sync';
  const auditId = await insertScrapeAudit(client, triggeredBy, vendor, startDate, 'Catchup sync initiated');

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
      console.log(`[Card Ownership] Skipping card ${accountData.accountNumber}`);
      sendEvent({ 
        type: 'skipping_card', 
        vendor, 
        accountNumber: accountData.accountNumber,
        message: `Skipping card ending in ${accountData.accountNumber} (already synced by another account)` 
      });
      skippedCards++;
      continue;
    }
    
    await claimCardOwnership(client, vendor, accountData.accountNumber, account.id);
    
    for (const txn of accountData.txns) {
      transactionCount++;
      await insertTransaction(txn, client, vendor, isBank, accountData.accountNumber, cache);
    }
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
  if (req.method === 'GET') {
    // Return status info about what would be synced
    const client = await getDB();
    try {
      const accountsResult = await client.query('SELECT * FROM vendor_credentials WHERE is_active = true ORDER BY vendor');
      const accounts = accountsResult.rows;

      if (accounts.length === 0) {
        return res.status(200).json({ 
          accounts: [],
          message: 'No accounts configured'
        });
      }

      const accountsInfo = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const account of accounts) {
        const lastDate = await getLastTransactionDateForVendor(client, account.vendor);
        
        let startDate;
        let daysDiff;
        
        if (lastDate) {
          const lastTransactionDate = new Date(lastDate);
          lastTransactionDate.setHours(0, 0, 0, 0);
          
          const referenceDate = lastTransactionDate > today ? today : lastTransactionDate;
          
          startDate = new Date(referenceDate);
          startDate.setDate(startDate.getDate() - 7);
          
          daysDiff = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24));
          daysDiff = Math.max(daysDiff, 7);
        } else {
          startDate = new Date(today);
          startDate.setDate(today.getDate() - 90);
          daysDiff = 90;
        }

        accountsInfo.push({
          id: account.id,
          vendor: account.vendor,
          nickname: account.nickname,
          lastTransactionDate: lastDate ? formatLocalDate(new Date(lastDate)) : null,
          syncFromDate: formatLocalDate(startDate),
          daysToSync: daysDiff
        });
      }

      return res.status(200).json({
        accounts: accountsInfo,
        totalAccounts: accountsInfo.length
      });
    } catch (error) {
      console.error('Error getting catchup info:', error);
      return res.status(500).json({ 
        message: 'Failed to get catchup info',
        error: error.message 
      });
    } finally {
      client.release();
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Set up SSE for streaming progress
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const client = await getDB();
  
  try {
    const accountsResult = await client.query('SELECT * FROM vendor_credentials WHERE is_active = true ORDER BY vendor');
    const accounts = accountsResult.rows;

    if (accounts.length === 0) {
      sendEvent({ type: 'error', message: 'No active accounts configured' });
      sendEvent({ type: 'done', success: false });
      return res.end();
    }

    // Decrypt credentials
    const decryptedAccounts = accounts.map(account => ({
      ...account,
      username: account.username ? decrypt(account.username) : null,
      password: account.password ? decrypt(account.password) : null,
      id_number: account.id_number ? decrypt(account.id_number) : null,
      card6_digits: account.card6_digits ? decrypt(account.card6_digits) : null,
    }));

    sendEvent({ 
      type: 'start', 
      totalAccounts: accounts.length,
      message: `Starting catchup sync for ${accounts.length} accounts...`
    });

    // Load category cache
    const cache = await loadCategoryCache(client);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const results = [];
    const errors = [];

    for (let i = 0; i < decryptedAccounts.length; i++) {
      const account = decryptedAccounts[i];
      
      const lastDate = await getLastTransactionDateForVendor(client, account.vendor);
      
      let startDate;
      if (lastDate) {
        const lastTransactionDate = new Date(lastDate);
        lastTransactionDate.setHours(0, 0, 0, 0);
        
        const referenceDate = lastTransactionDate > today ? today : lastTransactionDate;
        
        startDate = new Date(referenceDate);
        startDate.setDate(startDate.getDate() - 7);
      } else {
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 90);
      }

      const daysDiff = Math.max(Math.ceil((today - startDate) / (1000 * 60 * 60 * 24)), 1);
      const syncFromDateStr = formatLocalDate(startDate);
      
      sendEvent({ 
        type: 'progress', 
        current: i + 1,
        total: decryptedAccounts.length,
        vendor: account.vendor,
        nickname: account.nickname,
        lastTransactionDate: lastDate ? formatLocalDate(new Date(lastDate)) : null,
        syncFromDate: syncFromDateStr,
        daysToSync: daysDiff,
        message: `Syncing ${account.nickname || account.vendor} from ${syncFromDateStr} (${daysDiff} days)...`
      });

      try {
        const result = await scrapeAccount(client, account, startDate, sendEvent, cache);
        results.push({
          ...result,
          lastTransactionDate: lastDate ? formatLocalDate(new Date(lastDate)) : null,
          syncFromDate: formatLocalDate(startDate),
          status: 'success'
        });
        
        sendEvent({ 
          type: 'account_complete', 
          vendor: account.vendor,
          nickname: account.nickname,
          transactionCount: result.transactionCount,
          status: 'success',
          message: `✓ ${account.nickname || account.vendor}: ${result.transactionCount} transactions`
        });
      } catch (error) {
        console.error(`[Catchup Sync] Error scraping ${account.vendor}:`, error.message);
        errors.push({
          vendor: account.vendor,
          nickname: account.nickname,
          error: error.message,
          status: 'failed'
        });
        
        sendEvent({ 
          type: 'account_error', 
          vendor: account.vendor,
          nickname: account.nickname,
          error: error.message,
          message: `✗ ${account.nickname || account.vendor}: ${error.message}`
        });
      }

      // Wait between accounts
      if (i < decryptedAccounts.length - 1) {
        const nextAccount = decryptedAccounts[i + 1];
        const delay = RATE_LIMITED_VENDORS.includes(nextAccount?.vendor) ? 60000 : 10000;
        sendEvent({ 
          type: 'waiting',
          seconds: delay / 1000,
          message: `Waiting ${delay / 1000}s before next account...`
        });
        await sleep(delay);
      }
    }

    const totalTransactions = results.reduce((sum, r) => sum + (r.transactionCount || 0), 0);

    sendEvent({ 
      type: 'done', 
      success: true,
      summary: {
        totalAccounts: accounts.length,
        totalTransactions,
        successfulScrapes: results.length,
        failedScrapes: errors.length
      },
      results,
      errors,
      message: `Catchup sync completed! ${totalTransactions} transactions fetched.`
    });

  } catch (error) {
    console.error('Catchup sync failed:', error);
    sendEvent({ 
      type: 'error', 
      message: error.message || 'Unknown error'
    });
    sendEvent({ type: 'done', success: false });
  } finally {
    client.release();
    res.end();
  }
}

export default withAuth(handler);
