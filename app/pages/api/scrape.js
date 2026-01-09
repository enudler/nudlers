import { CompanyTypes, createScraper } from 'israeli-bank-scrapers';
import { getDB } from './db';
import { BANK_VENDORS } from '../../utils/constants';
import { withAuth } from './middleware/auth';
import {
  RATE_LIMITED_VENDORS,
  loadCategoryCache,
  lookupCachedCategory,
  insertTransaction,
  checkCardOwnership,
  claimCardOwnership,
  prepareCredentials,
  validateCredentials,
  getScraperOptions,
  getPreparePage,
  insertScrapeAudit,
  updateScrapeAudit,
  updateCredentialLastSynced,
  sleep,
} from './utils/scraperUtils';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const client = await getDB();
  let auditId = null;
  
  try {
    const { options, credentials, credentialId } = req.body;
    const companyId = CompanyTypes[options.companyId];
    if (!companyId) {
      throw new Error('Invalid company ID');
    }

    const isBank = BANK_VENDORS.includes(options.companyId);
    const isIsracardAmex = RATE_LIMITED_VENDORS.includes(options.companyId);

    // Prepare and validate credentials
    const scraperCredentials = prepareCredentials(options.companyId, credentials);
    validateCredentials(scraperCredentials);

    // For Isracard/Amex/Max, add a pre-scrape delay to avoid rate limiting
    if (isIsracardAmex) {
      const preDelay = Math.floor(Math.random() * 5000) + 3000;
      console.log(`[Scraper] Rate-limited vendor detected - adding ${Math.round(preDelay/1000)}s pre-scrape delay...`);
      await sleep(preDelay);
    }

    // Build scraper options with anti-detection measures
    const scraperOptions = {
      ...getScraperOptions(companyId, new Date(options.startDate), isIsracardAmex, {
        showBrowser: options.showBrowser ?? false,
      }),
      preparePage: getPreparePage(isIsracardAmex),
    };

    const scraper = createScraper(scraperOptions);

    // Insert audit row
    const triggeredBy = credentials?.username || credentials?.id || credentials?.nickname || 'unknown';
    auditId = await insertScrapeAudit(client, triggeredBy, options.companyId, new Date(options.startDate));

    // Execute scraping
    let result;
    try {
      result = await scraper.scrape(scraperCredentials);
    } catch (scrapeError) {
      await updateScrapeAudit(client, auditId, 'failed', scrapeError.message || 'Scraper exception');
      throw new Error(`Scraper exception: ${scrapeError.message}`);
    }
    
    if (!result.success) {
      const errorMsg = result.errorMessage || result.errorType || 'Scraping failed';
      await updateScrapeAudit(client, auditId, 'failed', errorMsg);
      throw new Error(`${result.errorType || 'GENERIC'}: ${errorMsg}`);
    }
    
    // Load category cache and process transactions
    const cache = await loadCategoryCache(client);
    
    let bankTransactions = 0;
    let cachedCategoryCount = 0;
    let skippedCards = 0;
    
    for (const account of result.accounts) {
      // Check card ownership
      const ownedByOther = await checkCardOwnership(client, options.companyId, account.accountNumber, credentialId);
      
      if (ownedByOther) {
        console.log(`[Card Ownership] Skipping card ${account.accountNumber} - already owned by credential ${ownedByOther}`);
        skippedCards++;
        continue;
      }
      
      // Claim ownership
      await claimCardOwnership(client, options.companyId, account.accountNumber, credentialId);
      
      for (const txn of account.txns) {
        if (isBank) bankTransactions++;
        
        const hadCategory = txn.category && txn.category !== 'N/A';
        await insertTransaction(txn, client, options.companyId, isBank, account.accountNumber, cache);
        if (!hadCategory && lookupCachedCategory(txn.description, cache)) {
          cachedCategoryCount++;
        }
      }
    }
    
    if (cachedCategoryCount > 0) {
      console.log(`[Category Cache] Applied cached categories to ${cachedCategoryCount} transactions`);
    }
    if (skippedCards > 0) {
      console.log(`[Card Ownership] Skipped ${skippedCards} cards owned by other credentials`);
    }

    // Update audit as success
    const accountsCount = Array.isArray(result.accounts) ? result.accounts.length : 0;
    await updateScrapeAudit(client, auditId, 'success', `Success: accounts=${accountsCount}, bankTxns=${bankTransactions}`);

    // Update last_synced_at
    await updateCredentialLastSynced(client, credentialId);

    res.status(200).json({
      message: 'Scraping and database update completed successfully',
      accounts: result.accounts
    });
  } catch (error) {
    console.error('Scraping failed:', error);
    
    if (auditId) {
      try {
        await updateScrapeAudit(client, auditId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      } catch (e) {
        // noop - avoid masking original error
      }
    }
    
    res.status(500).json({ 
      message: 'Scraping failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    client.release();
  }
}

export default withAuth(handler);
