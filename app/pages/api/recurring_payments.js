import { getDB } from "./db";

// API endpoint to get recurring payments:
// 1. Active installments (transactions with installments_total > 1)
// 2. Recurring transactions (same name, same amount, appearing in multiple months)
export default async function handler(req, res) {
  const client = await getDB();

  try {
    // Query 1: Get installments - transactions with active installment plans
    // We partition by name, price, account_number, AND the calculated original purchase date
    // to properly separate different purchases of the same item
    const installmentsResult = await client.query(`
      WITH installments_with_origin AS (
        SELECT 
          t.name,
          t.price,
          t.original_amount,
          t.original_currency,
          t.category,
          t.vendor,
          t.account_number,
          t.installments_number,
          t.installments_total,
          t.date,
          t.processed_date,
          -- Calculate the original purchase date (when installment 1 was charged)
          -- This helps identify unique installment plans
          (t.date - ((t.installments_number - 1) || ' months')::interval)::date as original_purchase_date
        FROM transactions t
        WHERE t.installments_total > 1
          AND t.installments_number IS NOT NULL
      ),
      latest_installments AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (
            -- Partition by name, original amount, total installments, account, AND original purchase month
            -- This separates: different cards, different items, and multiple purchases of same item
            -- We EXCLUDE exact price from partition to allow for 1-cent/shekel differences due to rounding
            PARTITION BY 
              LOWER(TRIM(name)), 
              COALESCE(ABS(original_amount), 0),
              installments_total,
              COALESCE(account_number, vendor), 
              DATE_TRUNC('month', original_purchase_date)
            -- Prioritize the "Next" installment:
            -- 1. Earliest future payment (date >= today)
            -- 2. Latest past payment (if all are in the past)
            ORDER BY 
              CASE WHEN date >= CURRENT_DATE THEN 0 ELSE 1 END,
              CASE WHEN date >= CURRENT_DATE THEN date ELSE NULL END ASC,
              date DESC
          ) as rn
        FROM installments_with_origin
      )
      SELECT 
        name,
        price,
        original_amount,
        original_currency,
        category,
        vendor,
        account_number,
        installments_number as current_installment,
        installments_total as total_installments,
        date as last_charge_date,
        processed_date as last_billing_date,
        original_purchase_date,
        -- Status: only 'completed' if final installment AND the date has passed
        CASE 
          WHEN installments_number >= installments_total AND date <= CURRENT_DATE THEN 'completed'
          ELSE 'active'
        END as status,
        -- Calculate the next payment date:
        -- If final installment and date passed, no next payment (truly completed)
        -- If current installment date is in the future, THAT is the next payment
        -- If date is in the past and more installments remain, estimate next month
        CASE 
          WHEN installments_number >= installments_total AND date <= CURRENT_DATE THEN NULL
          WHEN date >= CURRENT_DATE THEN date
          ELSE (date + '1 month'::interval)::date
        END as next_payment_date,
        -- Calculate the last/final payment date from the original purchase date
        -- Original purchase date + (total installments - 1) months = final payment
        (original_purchase_date + ((installments_total - 1) || ' months')::interval)::date as last_payment_date
      FROM latest_installments
      WHERE rn = 1
      ORDER BY 
        CASE WHEN installments_number >= installments_total AND date <= CURRENT_DATE THEN 1 ELSE 0 END,
        ABS(price) DESC,
        name ASC
    `);

    // Query 2: Get recurring transactions - same name, same price, same card, appearing in 2+ different months
    const recurringResult = await client.query(`
      WITH monthly_transactions AS (
        SELECT 
          LOWER(TRIM(t.name)) as normalized_name,
          t.name,
          ABS(t.price) as abs_price,
          t.price,
          t.category,
          t.vendor,
          t.account_number,
          COALESCE(t.account_number, t.vendor) as card_identifier,
          TO_CHAR(t.date, 'YYYY-MM') as month,
          t.date,
          t.processed_date,
          t.installments_total
        FROM transactions t
        WHERE t.price < 0
          AND (t.installments_total IS NULL OR t.installments_total <= 1)
          AND t.category NOT IN ('Bank', 'Income')
      ),
      recurring_groups AS (
        SELECT 
          normalized_name,
          abs_price,
          card_identifier,
          COUNT(DISTINCT month) as month_count,
          ARRAY_AGG(DISTINCT month ORDER BY month DESC) as months,
          MAX(date) as last_date,
          MAX(processed_date) as last_billing_date
        FROM monthly_transactions
        -- Group by name, price, AND card to separate same subscription on different cards
        GROUP BY normalized_name, abs_price, card_identifier
        HAVING COUNT(DISTINCT month) >= 2
      ),
      recurring_with_details AS (
        SELECT 
          rg.normalized_name,
          rg.abs_price,
          rg.card_identifier,
          rg.month_count,
          rg.months,
          rg.last_date,
          rg.last_billing_date,
          mt.name,
          mt.price,
          mt.category,
          mt.vendor,
          mt.account_number,
          ROW_NUMBER() OVER (
            PARTITION BY rg.normalized_name, rg.abs_price, rg.card_identifier
            ORDER BY mt.date DESC
          ) as rn
        FROM recurring_groups rg
        JOIN monthly_transactions mt ON 
          rg.normalized_name = mt.normalized_name 
          AND rg.abs_price = mt.abs_price
          AND rg.card_identifier = mt.card_identifier
      )
      SELECT 
        name,
        price,
        category,
        vendor,
        account_number,
        month_count,
        months[1] as last_month,
        last_date as last_charge_date,
        last_billing_date,
        months,
        -- Estimate next payment date (1 month after last charge)
        CASE 
          WHEN last_date > CURRENT_DATE THEN last_date
          ELSE (last_date + '1 month'::interval)::date
        END as next_payment_date,
        -- Calculate average monthly amount
        abs_price as monthly_amount
      FROM recurring_with_details
      WHERE rn = 1
      ORDER BY ABS(price) DESC, name ASC
    `);

    res.status(200).json({
      installments: installmentsResult.rows,
      recurring: recurringResult.rows
    });
  } catch (error) {
    console.error("Error fetching recurring payments:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message
    });
  } finally {
    client.release();
  }
}
