import { createApiHandler } from "../utils/apiHandler";
import { decrypt } from "../utils/encryption";
import { getDB } from "../db";
import { getBillingCycleSql } from "../../../utils/transaction_logic";
import { BANK_VENDORS } from "../../../utils/constants";
import logger from '../../../utils/logger.js';

const handler = async (req, res) => {
    if (req.method === 'GET') {
        return getTransactions(req, res);
    } else if (req.method === 'POST') {
        return addManualTransaction(req, res);
    } else if (req.method === 'DELETE') {
        return deleteAllTransactions(req, res);
    } else {
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
};

/**
 * POST /api/transactions
 * Add a manual transaction (expense or income)
 */
const addManualTransaction = async (req, res) => {
    const {
        name,
        price,
        date,
        category,
        vendor = 'manual',
        accountNumber,
        memo,
        type = 'normal'
    } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'name is required and must be a non-empty string' });
    }
    if (price === undefined || price === null || isNaN(Number(price))) {
        return res.status(400).json({ error: 'price is required and must be a number' });
    }
    if (!date) {
        return res.status(400).json({ error: 'date is required (YYYY-MM-DD format)' });
    }
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'date must be a valid date (YYYY-MM-DD format)' });
    }

    const finalPrice = Number(price);
    if (!isFinite(finalPrice)) {
        return res.status(400).json({ error: 'price must be a finite number' });
    }

    const client = await getDB();
    try {
        // Generate a unique identifier for manual transactions
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const identifier = `manual_${timestamp}_${randomSuffix}`;

        const transactionDate = parsedDate.toISOString().split('T')[0];
        const finalCategory = category || null;
        const finalAccountNumber = accountNumber || 'manual';
        const transactionType = BANK_VENDORS.some(v => vendor.toLowerCase().includes(v)) ? 'bank' : 'credit_card';

        const result = await client.query(
            `INSERT INTO transactions
             (identifier, vendor, date, name, price, category, type, processed_date, memo, status, account_number, category_source, transaction_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING identifier, vendor, date, name, price, category, memo, account_number`,
            [
                identifier,
                vendor,
                transactionDate,
                name.trim(),
                finalPrice,
                finalCategory,
                type,
                transactionDate,
                memo || null,
                'completed',
                finalAccountNumber,
                'manual',
                transactionType
            ]
        );

        res.status(201).json({
            success: true,
            transaction: result.rows[0],
            message: `Manual transaction "${name.trim()}" added successfully`
        });
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Error adding manual transaction');
        res.status(500).json({ error: 'Failed to add transaction' });
    } finally {
        client.release();
    }
};

/**
 * GET /api/transactions
 * List transactions with unified filtering
 */
const getTransactions = createApiHandler({
    validate: (req) => {
        const { transactionType, startDate, endDate, billingCycle, summary, availableMonths } = req.query;
        if (summary === 'true' || availableMonths === 'true') return; // Metadata queries don't need time filters
        if (transactionType && !['all', 'bank', 'credit_card'].includes(transactionType)) {
            return "transactionType must be 'all', 'bank', or 'credit_card'";
        }
        const isSearch = !!req.query.q;
        const isUncategorizedOnly = req.query.uncategorizedOnly === 'true';
        if (!billingCycle && (!startDate || !endDate) && !isSearch && !isUncategorizedOnly) {
            return "Time filter (billingCycle or startDate/endDate) is required unless searching or filtering by uncategorized";
        }
    },
    query: async (req) => {
        const {
            q,
            startDate,
            endDate,
            billingCycle,
            vendor,
            accountNumber,
            category,
            description,
            last4digits,
            bankAccountId,
            bankVendor,
            bankAccountNumber,
            transactionType = 'all',
            uncategorizedOnly,
            sortBy = 'date',
            sortOrder = 'desc',
            limit = 100,
            offset = 0,
            summary,
            availableMonths
        } = req.query;

        if (summary === 'true') {
            return {
                sql: `
                  SELECT 
                    COUNT(DISTINCT category) as categories_count,
                    COUNT(*) FILTER (WHERE category IS NULL OR category = 'N/A' OR category = '' OR category = 'Uncategorized') as non_mapped_count,
                    COUNT(*) as all_transactions_count,
                    (SELECT TO_CHAR(date, 'DD-MM-YYYY') FROM transactions ORDER BY date DESC LIMIT 1) as last_month_data
                  FROM transactions
                `
            };
        }

        if (availableMonths === 'true') {
            let billingStartDay = 10;
            const client = await getDB();
            try {
                const settingsResult = await client.query("SELECT value FROM app_settings WHERE key = 'billing_cycle_start_day'");
                if (settingsResult.rows.length > 0) {
                    const parsed = parseInt(settingsResult.rows[0].value, 10);
                    if (!isNaN(parsed)) billingStartDay = parsed;
                }
            } finally {
                client.release();
            }

            const cycleSql = getBillingCycleSql(billingStartDay, 'date', 'processed_date');
            return {
                sql: `SELECT ARRAY_AGG(DISTINCT ${cycleSql}) as months FROM transactions;`,
            };
        }

        const params = [];
        let paramIndex = 1;
        const conditions = [];

        // 1. Time Filtering (Billing Cycle or Date Range)
        if (billingCycle) {
            let billingStartDay = 10;
            const client = await getDB();
            try {
                const settingsResult = await client.query("SELECT value FROM app_settings WHERE key = 'billing_cycle_start_day'");
                if (settingsResult.rows.length > 0) {
                    const parsed = parseInt(settingsResult.rows[0].value, 10);
                    if (!isNaN(parsed)) billingStartDay = parsed;
                }
            } finally {
                client.release();
            }
            const effectiveMonthSql = getBillingCycleSql(billingStartDay, 't.date', 't.processed_date');
            conditions.push(`(${effectiveMonthSql}) = $${paramIndex}`);
            params.push(billingCycle);
            paramIndex++;
        } else if (startDate && endDate) {
            conditions.push(`t.date >= $${paramIndex}::date`);
            params.push(startDate);
            paramIndex++;
            conditions.push(`t.date <= $${paramIndex}::date`);
            params.push(endDate);
            paramIndex++;
        }

        // 2. Transaction Type Filtering
        if (transactionType === 'bank' || transactionType === 'credit_card') {
            conditions.push(`t.transaction_type = $${paramIndex}`);
            params.push(transactionType);
            paramIndex++;
        }

        // 3. Search Clause
        if (q) {
            conditions.push(`(t.name ILIKE $${paramIndex} OR t.vendor ILIKE $${paramIndex} OR t.category ILIKE $${paramIndex} OR t.identifier ILIKE $${paramIndex})`);
            params.push(`%${q}%`);
            paramIndex++;
        }

        // 4. Specific Filters
        if (vendor) {
            conditions.push(`t.vendor = $${paramIndex}`);
            params.push(vendor);
            paramIndex++;
        }
        if (accountNumber) {
            conditions.push(`t.account_number = $${paramIndex}`);
            params.push(accountNumber);
            paramIndex++;
        }
        if (category) {
            conditions.push(`t.category = $${paramIndex}`);
            params.push(category);
            paramIndex++;
        }
        if (description) {
            conditions.push(`t.name = $${paramIndex}`);
            params.push(description);
            paramIndex++;
        }
        if (last4digits) {
            if (last4digits === 'Unknown') {
                conditions.push(`(t.account_number IS NULL OR t.account_number = '')`);
            } else {
                conditions.push(`t.account_number LIKE '%' || $${paramIndex}`);
                params.push(last4digits);
                paramIndex++;
            }
        }
        if (uncategorizedOnly === 'true') {
            conditions.push(`(t.category IS NULL OR t.category = '' OR t.category = 'N/A')`);
        }

        // 5. Bank Account specific filters (supporting transactions_by_bank_account logic)
        let bankAccountParamIndex = null;
        if (bankAccountId && bankAccountId !== 'null') {
            const bankId = parseInt(bankAccountId, 10);
            if (isNaN(bankId)) {
                throw new Error('bankAccountId must be a valid number');
            }
            bankAccountParamIndex = paramIndex;
            conditions.push(`(
                (co.credential_id = $${paramIndex}) OR
                (co.linked_bank_account_id = $${paramIndex})
            )`);
            params.push(bankId);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // 6. Sorting
        const validSortColumns = ['name', 'price', 'date', 'category', 'account_number', 'vendor', 'processed_date'];
        const sortCol = validSortColumns.includes(sortBy) ? sortBy : 'date';
        const sortDir = sortOrder?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const limitVal = parseInt(limit, 10) || 100;
        const offsetVal = parseInt(offset, 10) || 0;
        params.push(limitVal, offsetVal);
        const limitParam = `$${paramIndex}`;
        const offsetParam = `$${paramIndex + 1}`;

        return {
            sql: `
        SELECT 
          t.identifier,
          t.vendor,
          t.date,
          t.name,
          t.price,
          t.category,
          t.type,
          t.processed_date,
          t.original_amount,
          t.original_currency,
          t.charged_currency,
          t.memo,
          t.status,
          t.installments_number,
          t.installments_total,
          t.account_number,
          t.category_source,
          t.rule_matched,
          t.transaction_type,
          vc.nickname as vendor_nickname,
          vc.card6_digits as card6_digits_encrypted
        FROM transactions t
        LEFT JOIN card_ownership co ON t.vendor = co.vendor AND t.account_number = co.account_number
        LEFT JOIN vendor_credentials vc ON co.credential_id = vc.id
        LEFT JOIN vendor_credentials ba ON ba.id = ${bankAccountParamIndex ? `$${bankAccountParamIndex}` : 'NULL'}
        ${whereClause}
        ORDER BY t.${sortCol} ${sortDir}, t.identifier, t.vendor
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `,
            params
        };
    },
    transform: (result, req) => {
        if (req.query.summary === 'true') {
            const row = result.rows[0];
            if (!row) {
                return { categories: 0, nonMapped: 0, allTransactions: 0, lastMonth: '-' };
            }
            return {
                categories: parseInt(row.categories_count, 10) || 0,
                nonMapped: parseInt(row.non_mapped_count, 10) || 0,
                allTransactions: parseInt(row.all_transactions_count, 10) || 0,
                lastMonth: row.last_month_data || '-'
            };
        }
        if (req.query.availableMonths === 'true') {
            const transactionMonths = result.rows[0]?.months || [];

            // Generate some future months
            const getAdvanceMonths = (count) => {
                const months = [];
                const now = new Date();
                for (let i = 0; i <= count; i++) {
                    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    months.push(`${year}-${month}`);
                }
                return months;
            };

            const advanceMonths = getAdvanceMonths(3);
            const allMonths = [...new Set([...transactionMonths, ...advanceMonths])];
            return allMonths.sort((a, b) => b.localeCompare(a));
        }
        return result.rows.map(row => ({
            ...row,
            card6_digits: row.card6_digits_encrypted ? decrypt(row.card6_digits_encrypted) : null,
            card6_digits_encrypted: undefined
        }));
    }
});

/**
 * DELETE /api/transactions
 * Delete all transactions (internal use, requires confirmation + rate limited)
 */
// In-memory rate limiter for destructive operations
const destructiveOpTimestamps = [];
const DESTRUCTIVE_OP_LIMIT = 3; // max calls
const DESTRUCTIVE_OP_WINDOW_MS = 60 * 60 * 1000; // per hour

const deleteAllTransactions = async (req, res) => {
    const { confirm } = req.body;
    if (!confirm) {
        return res.status(400).json({ error: "Confirmation is required to delete all transactions" });
    }

    // Rate limit: max N destructive operations per hour
    const now = Date.now();
    // Clean old entries
    while (destructiveOpTimestamps.length > 0 && now - destructiveOpTimestamps[0] > DESTRUCTIVE_OP_WINDOW_MS) {
        destructiveOpTimestamps.shift();
    }
    if (destructiveOpTimestamps.length >= DESTRUCTIVE_OP_LIMIT) {
        logger.warn('Rate limit exceeded for delete-all-transactions');
        return res.status(429).json({ error: 'Too many destructive operations. Try again later.' });
    }
    destructiveOpTimestamps.push(now);

    logger.warn('Delete all transactions requested');

    const client = await getDB();
    try {
        await client.query('DELETE FROM transactions');
        logger.warn('All transactions deleted successfully');
        res.status(200).json({ success: true, message: 'All transactions deleted' });
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, 'Error deleting all transactions');
        res.status(500).json({ error: 'Failed to delete transactions' });
    } finally {
        client.release();
    }
};

export default handler;
