import { getDB } from "../db";
import logger from '../../../utils/logger.js';
import { detectRecurringPayments } from "../utils/recurringDetection";

/**
 * API endpoint to get recurring payments.
 * Returns:
 * 1. Active installments (transactions with installments_total > 1)
 * 2. Recurring transactions (detected via smart name/amount/date patterns)
 */
export default async function handler(req, res) {
  const client = await getDB();

  try {
    // Query 1: Get installments - transactions with active installment plans
    const installmentsResult = await client.query(`
      WITH installments_with_origin AS (
        SELECT 
          t.name, t.price, t.original_amount, t.original_currency,
          t.category, t.vendor, t.account_number,
          t.installments_number, t.installments_total,
          t.date, t.processed_date,
          (t.date - ((t.installments_number - 1) || ' months')::interval)::date as original_purchase_date
        FROM transactions t
        WHERE t.installments_total > 1
          AND t.installments_number IS NOT NULL
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
      )
      SELECT 
        name, price, original_amount, original_currency,
        category, vendor, account_number,
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
      ORDER BY 
        CASE WHEN status = 'completed' THEN 1 ELSE 0 END,
        ABS(price) DESC,
        name ASC
    `);

    // Query 2: Get candidate transactions for smart recurring detection
    const candidatesResult = await client.query(`
      SELECT 
        name, price, category, vendor, account_number, date
      FROM transactions
      WHERE price < 0
        AND (installments_total IS NULL OR installments_total <= 1)
        AND category NOT IN ('Bank', 'Income')
      ORDER BY date DESC
    `);

    // Use the smart detection utility (fuzzy matching, monthly/bi-monthly)
    const recurring = detectRecurringPayments(candidatesResult.rows);

    res.status(200).json({
      installments: installmentsResult.rows,
      recurring: recurring.sort((a, b) => Math.abs(b.monthly_amount) - Math.abs(a.monthly_amount))
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
