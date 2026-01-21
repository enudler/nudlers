import { createApiHandler } from "../utils/apiHandler";
import { decrypt } from "../utils/encryption";
import { getDB } from "../db";
import { getBillingCycleSql } from "../../../utils/transaction_logic";

// Known bank vendors for filtering
const STANDARD_BANK_VENDORS = ['hapoalim', 'poalim', 'leumi', 'mizrahi', 'discount', 'yahav', 'union', 'fibi', 'jerusalem', 'onezero', 'pepper'];
const BEINLEUMI_GROUP_VENDORS = ['otsarHahayal', 'otsar_hahayal', 'beinleumi', 'massad', 'pagi'];
const BANK_VENDORS = [...STANDARD_BANK_VENDORS, ...BEINLEUMI_GROUP_VENDORS];

const handler = async (req, res) => {
    if (req.method === 'GET') {
        return getTransactions(req, res);
    } else if (req.method === 'POST') {
        return createManualTransaction(req, res);
    } else if (req.method === 'DELETE') {
        return deleteAllTransactions(req, res);
    } else {
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
};

/**
 * GET /api/transactions
 * List transactions with unified filtering
 */
const getTransactions = createApiHandler({
    validate: (req) => {
        const { transactionType, startDate, endDate, billingCycle } = req.query;
        if (transactionType && !['all', 'bank', 'credit_card'].includes(transactionType)) {
            return "transactionType must be 'all', 'bank', or 'credit_card'";
        }
        // Most filters require some time context unless specifically searching or viewing uncategorized
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
            limit = 100,
            offset = 0
        } = req.query;

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
                    billingStartDay = parseInt(settingsResult.rows[0].value);
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
        if (transactionType === 'bank') {
            conditions.push(`(
        (t.category IN ('Bank', 'Income', 'Salary')) OR 
        (LOWER(t.vendor) SIMILAR TO '%(${BANK_VENDORS.join('|').toLowerCase()})%')
      ) AND NOT (
        LENGTH(COALESCE(t.account_number, '')) = 4 OR COALESCE(t.installments_total, 0) > 0
      )`);
        } else if (transactionType === 'credit_card') {
            conditions.push(`(
        LENGTH(COALESCE(t.account_number, '')) = 4 OR COALESCE(t.installments_total, 0) > 0
      )`);
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
                conditions.push(`RIGHT(t.account_number, 4) = $${paramIndex}`);
                params.push(last4digits);
                paramIndex++;
            }
        }
        if (uncategorizedOnly === 'true') {
            conditions.push(`(t.category IS NULL OR t.category = '' OR t.category = 'N/A')`);
        }

        // 5. Bank Account specific filters (supporting transactions_by_bank_account logic)
        if (bankAccountId && bankAccountId !== 'null') {
            const bankId = parseInt(bankAccountId);
            // Filter by linked bank account: 
            // 1. Bank transactions (where t.account_number matches ba.bank_account_number)
            // 2. Credit card transactions (where card is linked to this bank account)
            conditions.push(`(
                (ba.id IS NOT NULL AND t.account_number LIKE '%' || ba.bank_account_number) OR
                (co.linked_bank_account_id = $${paramIndex})
            )`);
            params.push(bankId);
            paramIndex++;
        }
        if (bankVendor) {
            conditions.push(`LOWER(t.vendor) LIKE LOWER($${paramIndex})`);
            params.push(`%${bankVendor}%`);
            paramIndex++;
        }
        if (bankAccountNumber) {
            conditions.push(`t.account_number LIKE '%' || $${paramIndex}`);
            params.push(bankAccountNumber);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        const limitVal = parseInt(limit) || 100;
        const offsetVal = parseInt(offset) || 0;
        params.push(limitVal, offsetVal);
        const limitParam = `$${paramIndex}`;
        const offsetParam = `$${paramIndex + 1}`;

        return {
            sql: `
        SELECT DISTINCT ON (t.identifier, t.vendor)
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
        LEFT JOIN vendor_credentials ba ON ba.id = ${bankAccountId && bankAccountId !== 'null' ? `$${params.indexOf(parseInt(bankAccountId)) + 1}` : 'NULL'}
        ${whereClause}
        ORDER BY t.identifier, t.vendor, t.date DESC
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `,
            params
        };
    },
    transform: (result) => {
        return result.rows.map(row => ({
            ...row,
            card6_digits: row.card6_digits_encrypted ? decrypt(row.card6_digits_encrypted) : null,
            card6_digits_encrypted: undefined
        }));
    }
});

/**
 * POST /api/transactions
 * Create a manual transaction
 */
const createManualTransaction = async (req, res) => {
    const { name, amount, date, type, category } = req.body;

    if (!name || amount === undefined || !date || !type) {
        return res.status(400).json({ error: "Name, amount, date, and type are required" });
    }
    if (type === 'expense' && !category) {
        return res.status(400).json({ error: "Category is required for expense transactions" });
    }

    const client = await getDB();
    try {
        const identifier = `manual_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const vendor = type === 'income' ? 'manual_income' : 'manual_expense';
        const transactionCategory = type === 'income' ? 'Bank' : category;
        const price = type === 'expense' ? -Math.abs(amount) : Math.abs(amount);

        const sql = `
      INSERT INTO transactions (
        identifier, vendor, date, name, price, category, type, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
        const result = await client.query(sql, [
            identifier, vendor, new Date(date), name, price, transactionCategory, type, 'completed'
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

/**
 * DELETE /api/transactions
 * Delete all transactions (internal use, requires confirmation)
 */
const deleteAllTransactions = async (req, res) => {
    const { confirm } = req.body;
    if (!confirm) {
        return res.status(400).json({ error: "Confirmation is required to delete all transactions" });
    }

    const client = await getDB();
    try {
        const result = await client.query('DELETE FROM transactions');
        res.status(200).json({ success: true, deleted: result.rowCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

export default handler;

