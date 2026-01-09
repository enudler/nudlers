import crypto from 'crypto';

/**
 * Generates a robust unique identifier for a transaction.
 * This is the primary defense against duplicates.
 * 
 * Components used for uniqueness:
 * - Original identifier from scraper (if available)
 * - Vendor/company ID
 * - Account number (card last digits)
 * - Transaction date
 * - Processed date (billing date)
 * - Description (normalized)
 * - Amount (to distinguish similar transactions)
 */
export function generateTransactionIdentifier(txn, companyId, accountNumber) {
  // Normalize all components to handle nulls/undefined
  const originalId = txn.identifier || '';
  const vendor = companyId || '';
  const account = accountNumber || '';
  const date = txn.date ? new Date(txn.date).toISOString().split('T')[0] : '';
  const processedDate = txn.processedDate ? new Date(txn.processedDate).toISOString().split('T')[0] : '';
  const description = normalizeDescription(txn.description || '');
  const amount = txn.chargedAmount ?? txn.originalAmount ?? 0;
  
  // Create a comprehensive unique string
  const uniqueId = [
    originalId,
    vendor,
    account,
    date,
    processedDate,
    description,
    amount.toFixed(2)
  ].join('|');
  
  const hash = crypto.createHash('sha256');
  hash.update(uniqueId);
  return hash.digest('hex').substring(0, 40); // 40 chars is enough for uniqueness
}

/**
 * Normalizes a description for consistent matching.
 * Removes extra whitespace, converts to lowercase, removes special chars.
 */
export function normalizeDescription(description) {
  if (!description) return '';
  return description
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Multiple spaces to single space
    .replace(/[^\w\s\u0590-\u05FF]/g, ''); // Keep only alphanumeric, spaces, and Hebrew
}
