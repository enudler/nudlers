import { getDB } from "../db";
import logger from '../../../utils/logger.js';
import { detectRecurringPayments } from "../../../utils/recurringDetection";

/**
 * API endpoint to get recurring payments.
 *
 * Query Parameters:
 * - type: 'installments' | 'recurring' | 'all' (default: 'all')
 * - status: 'active' | 'completed' | 'all' (for installments, default: 'all')
 * - frequency: 'monthly' | 'bi-monthly' | 'all' (for recurring, default: 'all')
 * - limit: number (default: 50, max: 500)
 * - offset: number (default: 0)
 * - sortBy: field to sort by (varies by type)
 * - sortOrder: 'asc' | 'desc' (default: 'desc')
 *
 * Returns:
 * 1. Active installments (transactions with installments_total > 1)
 * 2. Recurring transactions (detected via smart name/amount/date patterns)
 */
export default async function handler(req, res) {
  const client = await getDB();

  try {
    // Parse query parameters
    const {
      type = 'all',
      status = 'all',
      frequency = 'all',
      limit = '50',
      offset = '0',
      sortBy,
      sortOrder = 'desc'
    } = req.query;

    const limitVal = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const offsetVal = Math.max(parseInt(offset, 10) || 0, 0);
    const sortDir = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let installments = [];
    let totalInstallments = 0;
    let activeInstallmentsCount = 0;
    let activeInstallmentsAmount = 0;
    let recurring = [];
    let totalRecurring = 0;

    // Fetch installments if type is 'all' or 'installments'
    if (type === 'all' || type === 'installments') {
      // Build status filter
      let statusFilter = '';
      if (status === 'active') {
        statusFilter = `AND (installments_number < installments_total OR date > CURRENT_DATE)`;
      } else if (status === 'completed') {
        statusFilter = `AND installments_number >= installments_total AND date <= CURRENT_DATE`;
      }

      // Build order clause for installments
      // Default: active first (status ASC), then by next_payment_date
      let installmentOrderClause;
      const installmentSortBy = sortBy || 'status';

      switch (installmentSortBy) {
        case 'amount':
          installmentOrderClause = `ABS(price) ${sortDir}, name ASC`;
          break;
        case 'next_payment_date':
          installmentOrderClause = `CASE WHEN next_payment_date IS NULL THEN 1 ELSE 0 END, next_payment_date ${sortDir}, name ASC`;
          break;
        case 'name':
          installmentOrderClause = `name ${sortDir}`;
          break;
        case 'status':
        default:
          // Default: active first, then by amount DESC
          installmentOrderClause = `CASE WHEN status = 'completed' THEN 1 ELSE 0 END ${sortDir === 'ASC' ? 'DESC' : 'ASC'}, ABS(price) DESC, name ASC`;
          break;
      }

      const installmentsResult = await client.query(`
        WITH installments_with_origin AS (
          SELECT
            t.name, t.price, t.original_amount, t.original_currency,
            t.category, t.vendor, t.account_number, t.transaction_type,
            t.installments_number, t.installments_total,
            t.date, t.processed_date,
            (t.date - ((t.installments_number - 1) || ' months')::interval)::date as original_purchase_date
          FROM transactions t
          WHERE t.installments_total > 1
            AND t.installments_number IS NOT NULL
            ${statusFilter}
        ),
        latest_installments AS (
          SELECT
            *,
            CASE
              WHEN installments_number >= installments_total AND date <= CURRENT_DATE THEN 'completed'
              ELSE 'active'
            END as status,
            ROW_NUMBER() OVER (
              PARTITION BY
                LOWER(TRIM(name)),
                COALESCE(ABS(original_amount), 0),
                installments_total,
                COALESCE(account_number, vendor),
                DATE_TRUNC('month', original_purchase_date)
              ORDER BY
                CASE WHEN date >= CURRENT_DATE THEN 0 ELSE 1 END,
                CASE WHEN date >= CURRENT_DATE THEN date ELSE NULL END ASC,
                date DESC
            ) as rn
          FROM installments_with_origin
        ),
        final_installments AS (
          SELECT
            name, price, original_amount, original_currency,
            category, vendor, account_number, transaction_type,
            installments_number as current_installment,
            installments_total as total_installments,
            date as last_charge_date,
            processed_date as last_billing_date,
            original_purchase_date,
            status,
            CASE
              WHEN status = 'completed' THEN NULL
              WHEN date >= CURRENT_DATE THEN date
              ELSE (date + '1 month'::interval)::date
            END as next_payment_date,
            (original_purchase_date + ((installments_total - 1) || ' months')::interval)::date as last_payment_date
          FROM latest_installments
          WHERE rn = 1
        )
        SELECT
          l.name, l.price, l.original_amount, l.original_currency,
          l.category, l.vendor, l.account_number, l.transaction_type,
          l.current_installment, l.total_installments,
          l.last_charge_date, l.last_billing_date,
          l.original_purchase_date, l.status,
          l.next_payment_date, l.last_payment_date,
          vc.nickname as bank_nickname,
          vc.bank_account_number as bank_account_display,
          COUNT(*) OVER() as total_count,
          COUNT(*) FILTER (WHERE l.status = 'active') OVER() as active_count,
          COALESCE(SUM(ABS(l.price)) FILTER (WHERE l.status = 'active') OVER(), 0) as active_amount
        FROM final_installments l
        LEFT JOIN vendor_credentials vc ON l.account_number = vc.bank_account_number AND l.transaction_type = 'bank'
        ORDER BY ${installmentOrderClause}
        LIMIT $1 OFFSET $2
      `, type === 'installments' ? [limitVal, offsetVal] : [1000, 0]);

      totalInstallments = installmentsResult.rows.length > 0
        ? parseInt(installmentsResult.rows[0].total_count, 10)
        : 0;
      activeInstallmentsCount = installmentsResult.rows.length > 0
        ? parseInt(installmentsResult.rows[0].active_count, 10)
        : 0;
      activeInstallmentsAmount = installmentsResult.rows.length > 0
        ? parseFloat(installmentsResult.rows[0].active_amount)
        : 0;
      installments = installmentsResult.rows.map(({ total_count, active_count, active_amount, ...row }) => row);
    }

    // Fetch recurring if type is 'all' or 'recurring'
    if (type === 'all' || type === 'recurring') {
      // Query candidates for smart recurring detection
      const candidatesResult = await client.query(`
        WITH known_installments AS (
          SELECT DISTINCT LOWER(TRIM(name)) as name
          FROM transactions
          WHERE installments_total > 1
        )
        SELECT
          t.name, t.price, t.category, t.vendor, t.account_number, t.date, t.transaction_type,
          vc.nickname as bank_nickname,
          vc.bank_account_number as bank_account_display
        FROM transactions t
        LEFT JOIN vendor_credentials vc ON t.account_number = vc.bank_account_number AND t.transaction_type = 'bank'
        WHERE t.price < 0
          AND (t.installments_total IS NULL OR t.installments_total <= 1)
          AND t.category NOT IN ('Bank', 'Income')
          AND LOWER(TRIM(t.name)) NOT IN (SELECT name FROM known_installments)
        ORDER BY t.date DESC
      `);

      // Use the smart detection utility (fuzzy matching, monthly/bi-monthly)
      let detectedRecurring = detectRecurringPayments(candidatesResult.rows);

      // Apply frequency filter
      if (frequency !== 'all') {
        detectedRecurring = detectedRecurring.filter(r => r.frequency === frequency);
      }

      // Sort recurring
      const recurringSortBy = sortBy || 'amount';

      detectedRecurring.sort((a, b) => {
        let comparison = 0;

        switch (recurringSortBy) {
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'frequency':
            // monthly before bi-monthly
            const freqOrder = { 'monthly': 1, 'bi-monthly': 2 };
            comparison = (freqOrder[a.frequency] || 99) - (freqOrder[b.frequency] || 99);
            break;
          case 'month_count':
            comparison = b.month_count - a.month_count;
            break;
          case 'last_charge_date':
            comparison = new Date(b.last_charge_date) - new Date(a.last_charge_date);
            break;
          case 'next_payment_date':
            comparison = new Date(b.next_payment_date) - new Date(a.next_payment_date);
            break;
          case 'amount':
          default:
            comparison = Math.abs(b.monthly_amount) - Math.abs(a.monthly_amount);
            break;
        }

        return sortDir === 'ASC' ? -comparison : comparison;
      });

      totalRecurring = detectedRecurring.length;

      // Apply pagination for recurring
      if (type === 'recurring') {
        recurring = detectedRecurring.slice(offsetVal, offsetVal + limitVal);
      } else {
        recurring = detectedRecurring;
      }
    }

    // Apply pagination when type is 'all' - paginate combined results
    if (type === 'all') {
      // When fetching all, we return both lists but with limited items
      // Pagination applies separately to each list
      const installmentLimit = Math.ceil(limitVal / 2);
      const recurringLimit = Math.ceil(limitVal / 2);

      installments = installments.slice(offsetVal, offsetVal + installmentLimit);
      recurring = recurring.slice(offsetVal, offsetVal + recurringLimit);
    }

    res.status(200).json({
      installments,
      recurring,
      pagination: {
        limit: limitVal,
        offset: offsetVal,
        totalInstallments,
        totalRecurring,
        total: totalInstallments + totalRecurring
      },
      summary: {
        activeInstallmentsCount,
        activeInstallmentsAmount
      }
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, "Error fetching recurring payments");
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message
    });
  } finally {
    client.release();
  }
}
