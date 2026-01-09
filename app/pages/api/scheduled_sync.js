import { CompanyTypes, createScraper } from 'israeli-bank-scrapers';
import { getDB } from './db';
import { BANK_VENDORS } from '../../utils/constants';
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
} from './utils/scraperUtils';

async function scrapeAccount(client, account, startDate, cache = null) {
  const vendor = account.vendor;
  const companyId = CompanyTypes[vendor];
  
  if (!companyId) {
    throw new Error(`Invalid vendor: ${vendor}`);
  }

  const isBank = BANK_VENDORS.includes(vendor);
  const isIsracardAmex = RATE_LIMITED_VENDORS.includes(vendor);

  const scraperCredentials = prepareCredentials(vendor, account);

  // Add pre-scrape delay for rate-limited vendors
  if (isIsracardAmex) {
    const preDelay = Math.floor(Math.random() * 5000) + 3000;
    console.log(`[Scheduled Sync] Pre-delay for ${vendor}: ${Math.round(preDelay/1000)}s`);
    await sleep(preDelay);
  }

  const scraperOptions = {
    ...getScraperOptions(companyId, startDate, isIsracardAmex, { verbose: false }),
    preparePage: getPreparePage(isIsracardAmex),
  };

  // Insert audit row
  const auditId = await insertScrapeAudit(client, 'scheduled_sync', vendor, startDate, 'Scheduled sync initiated');

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
  const syncedCards = [];
  
  for (const accountData of result.accounts) {
    const ownedByOther = await checkCardOwnership(client, vendor, accountData.accountNumber, account.id);
    if (ownedByOther) continue;
    
    await claimCardOwnership(client, vendor, accountData.accountNumber, account.id);
    
    const cardTxnCount = accountData.txns.length;
    for (const txn of accountData.txns) {
      transactionCount++;
      await insertTransaction(txn, client, vendor, isBank, accountData.accountNumber, cache);
    }
    
    if (accountData.accountNumber) {
      syncedCards.push({
        last4: accountData.accountNumber.slice(-4),
        accountNumber: accountData.accountNumber,
        transactionCount: cardTxnCount
      });
    }
  }

  // Update audit as success
  await updateScrapeAudit(client, auditId, 'success', `Success: txns=${transactionCount}, cards=${syncedCards.length}`);

  // Update last_synced_at
  await updateCredentialLastSynced(client, account.id);

  return {
    vendor,
    nickname: account.nickname,
    transactionCount,
    accountsCount: result.accounts.length,
    cards: syncedCards
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Optional: Check for secret key for external scheduler
  const schedulerSecret = process.env.SCHEDULER_SECRET;
  if (schedulerSecret && req.headers['x-scheduler-secret'] !== schedulerSecret) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const triggeredBy = req.body?.manual ? 'manual' : 'scheduler';
  const client = await getDB();

  try {
    // Check if a sync is already running
    const runningCheck = await client.query(
      `SELECT id FROM scheduled_sync_runs WHERE status = 'running' AND started_at > NOW() - INTERVAL '1 hour'`
    );
    
    if (runningCheck.rows.length > 0) {
      return res.status(409).json({ 
        message: 'A scheduled sync is already running',
        runId: runningCheck.rows[0].id
      });
    }

    // Get config
    const configResult = await client.query('SELECT * FROM scheduled_sync_config LIMIT 1');
    const config = configResult.rows[0] || { days_to_sync: 7 };

    // Get all active accounts
    const accountsResult = await client.query(
      'SELECT * FROM vendor_credentials WHERE is_active = true ORDER BY vendor'
    );
    const accounts = accountsResult.rows;

    if (accounts.length === 0) {
      return res.status(400).json({ message: 'No active accounts configured' });
    }

    // Create sync run record
    const runResult = await client.query(
      `INSERT INTO scheduled_sync_runs (status, total_accounts, triggered_by)
       VALUES ('running', $1, $2) RETURNING id`,
      [accounts.length, triggeredBy]
    );
    const runId = runResult.rows[0].id;

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

    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (config.days_to_sync || 7));
    startDate.setHours(0, 0, 0, 0);

    const results = [];
    const errors = [];
    let totalTransactions = 0;

    // Process each account
    for (let i = 0; i < decryptedAccounts.length; i++) {
      const account = decryptedAccounts[i];
      
      try {
        console.log(`[Scheduled Sync] Scraping ${account.vendor} (${account.nickname})`);
        const result = await scrapeAccount(client, account, startDate, cache);
        results.push({
          vendor: account.vendor,
          nickname: account.nickname,
          status: 'success',
          transactionCount: result.transactionCount,
          cardsCount: result.cards?.length || 0,
          cards: result.cards || []
        });
        totalTransactions += result.transactionCount;
      } catch (error) {
        console.error(`[Scheduled Sync] Error scraping ${account.vendor}:`, error.message);
        errors.push({
          vendor: account.vendor,
          nickname: account.nickname,
          status: 'failed',
          error: error.message
        });
      }

      // Wait between accounts
      if (i < decryptedAccounts.length - 1) {
        const nextVendor = decryptedAccounts[i + 1]?.vendor;
        const delay = RATE_LIMITED_VENDORS.includes(nextVendor) ? 60000 : 15000;
        console.log(`[Scheduled Sync] Waiting ${delay/1000}s before next account...`);
        await sleep(delay);
      }
    }

    // Determine final status
    let finalStatus = 'success';
    if (errors.length > 0 && results.length > 0) {
      finalStatus = 'partial';
    } else if (errors.length > 0 && results.length === 0) {
      finalStatus = 'failed';
    }

    // Update sync run record
    const syncEndDate = new Date();
    await client.query(
      `UPDATE scheduled_sync_runs SET
        completed_at = CURRENT_TIMESTAMP,
        status = $1,
        successful_accounts = $2,
        failed_accounts = $3,
        total_transactions = $4,
        details = $5
       WHERE id = $6`,
      [
        finalStatus,
        results.length,
        errors.length,
        totalTransactions,
        JSON.stringify({ 
          results, 
          errors,
          dateRange: {
            startDate: startDate.toISOString(),
            endDate: syncEndDate.toISOString()
          }
        }),
        runId
      ]
    );

    res.status(200).json({
      message: 'Scheduled sync completed',
      runId,
      status: finalStatus,
      summary: {
        totalAccounts: accounts.length,
        successful: results.length,
        failed: errors.length,
        totalTransactions
      },
      results,
      errors
    });

  } catch (error) {
    console.error('Scheduled sync failed:', error);
    res.status(500).json({
      message: 'Scheduled sync failed',
      error: error.message
    });
  } finally {
    client.release();
  }
}
