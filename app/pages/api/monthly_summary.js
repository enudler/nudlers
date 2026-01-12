import { createApiHandler } from "./utils/apiHandler";

const handler = createApiHandler({
  query: async (req) => {
    const { startDate, endDate, vendor, groupBy, billingCycle } = req.query;

    // Build WHERE clause based on filters
    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    // If billingCycle is provided (e.g., "2026-01"), filter by processed_date month
    // This is more accurate for credit card billing cycles
    if (billingCycle) {
      whereClause = `WHERE TO_CHAR(t.processed_date, 'YYYY-MM') = $${paramIndex}`;
      params.push(billingCycle);
      paramIndex++;
    }
    // Otherwise use date range if provided (calendar mode)
    else if (startDate && endDate) {
      whereClause = `WHERE t.date >= $${paramIndex}::date AND t.date <= $${paramIndex + 1}::date`;
      params.push(startDate, endDate);
      paramIndex += 2;
    }

    if (vendor) {
      if (whereClause) {
        whereClause += ` AND t.vendor = $${paramIndex}`;
      } else {
        whereClause = `WHERE t.vendor = $${paramIndex}`;
      }
      params.push(vendor);
      paramIndex++;
    }

    // Join with card_ownership to get the correct credential for each card
    // This prevents duplicate rows when multiple credentials exist for the same vendor
    const credentialJoin = `
      LEFT JOIN card_ownership co ON t.vendor = co.vendor AND RIGHT(t.account_number, 4) = RIGHT(co.account_number, 4)
      LEFT JOIN vendor_credentials vc ON co.credential_id = vc.id
    `;

    // Group by description (transaction name) - aggregate across entire date range
    if (groupBy === 'description') {
      return {
        sql: `
          SELECT 
            t.name as description,
            t.category,
            COUNT(DISTINCT (t.identifier, t.vendor)) as transaction_count,
            -- Bank transactions (business): positive = income, negative = expense
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price > 0 THEN t.price ELSE 0 END), 0) as bank_income,
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price < 0 THEN ABS(t.price) ELSE 0 END), 0) as bank_expenses,
            -- Credit card transactions (excluding Bank and Income categories)
            -- Note: price is already the per-installment amount (combineInstallments: false)
            ROUND(COALESCE(SUM(
              CASE WHEN COALESCE(t.category, 'Uncategorized') NOT IN ('Bank', 'Income') THEN ABS(t.price) ELSE 0 END
            ), 0)::numeric, 0) as card_expenses,
            ROUND((
              COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price > 0 THEN t.price ELSE 0 END), 0) -
              COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price < 0 THEN ABS(t.price) ELSE 0 END), 0) -
              COALESCE(SUM(
                CASE WHEN COALESCE(t.category, 'Uncategorized') NOT IN ('Bank', 'Income') THEN ABS(t.price) ELSE 0 END
              ), 0)
            )::numeric, 0) as net_balance
          FROM transactions t
          ${credentialJoin}
          ${whereClause}
          GROUP BY t.name, t.category
          ORDER BY (
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price > 0 THEN t.price ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price < 0 THEN ABS(t.price) ELSE 0 END), 0) +
            COALESCE(SUM(
              CASE WHEN COALESCE(t.category, 'Uncategorized') NOT IN ('Bank', 'Income') THEN ABS(t.price) ELSE 0 END
            ), 0)
          ) DESC, t.name
        `,
        params
      };
    }

    // Group by last 4 digits of account number - aggregate across entire date range
    if (groupBy === 'last4digits') {
      return {
        sql: `
          SELECT 
            COALESCE(RIGHT(t.account_number, 4), 'Unknown') as last4digits,
            COUNT(DISTINCT (t.identifier, t.vendor)) as transaction_count,
            -- Bank transactions (business): positive = income, negative = expense
            ROUND(COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price > 0 THEN t.price ELSE 0 END), 0)::numeric, 0) as bank_income,
            ROUND(COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price < 0 THEN ABS(t.price) ELSE 0 END), 0)::numeric, 0) as bank_expenses,
            -- Credit card transactions (excluding Bank and Income categories)
            -- Note: price is already the per-installment amount (combineInstallments: false)
            ROUND(COALESCE(SUM(
              CASE WHEN COALESCE(t.category, 'Uncategorized') NOT IN ('Bank', 'Income') THEN ABS(t.price) ELSE 0 END
            ), 0)::numeric, 0) as card_expenses,
            ROUND((
              COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price > 0 THEN t.price ELSE 0 END), 0) -
              COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price < 0 THEN ABS(t.price) ELSE 0 END), 0) -
              COALESCE(SUM(
                CASE WHEN COALESCE(t.category, 'Uncategorized') NOT IN ('Bank', 'Income') THEN ABS(t.price) ELSE 0 END
              ), 0)
            )::numeric, 0) as net_balance,
            -- Include bank account info from card ownership
            ba.id as bank_account_id,
            COALESCE(ba.nickname, co.custom_bank_account_nickname) as bank_account_nickname,
            COALESCE(ba.bank_account_number, co.custom_bank_account_number) as bank_account_number,
            co.custom_bank_account_number,
            co.custom_bank_account_nickname,
            ba.vendor as bank_account_vendor
          FROM transactions t
          ${credentialJoin}
          LEFT JOIN vendor_credentials ba ON co.linked_bank_account_id = ba.id
          ${whereClause}
          GROUP BY COALESCE(RIGHT(t.account_number, 4), 'Unknown'), ba.id, ba.nickname, ba.bank_account_number, ba.vendor, co.custom_bank_account_nickname, co.custom_bank_account_number
          ORDER BY (
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price > 0 THEN t.price ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price < 0 THEN ABS(t.price) ELSE 0 END), 0) +
            COALESCE(SUM(
              CASE WHEN COALESCE(t.category, 'Uncategorized') NOT IN ('Bank', 'Income') THEN ABS(t.price) ELSE 0 END
            ), 0)
          ) DESC, COALESCE(RIGHT(t.account_number, 4), 'Unknown')
        `,
        params
      };
    }

    // Default: Group by vendor/card
    return {
      sql: `
        WITH monthly_data AS (
          SELECT 
            TO_CHAR(t.date, 'YYYY-MM') as month,
            t.vendor,
            vc.nickname as vendor_nickname,
            -- Bank transactions (business): positive = income, negative = expense
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price > 0 THEN t.price ELSE 0 END), 0) as bank_income,
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price < 0 THEN ABS(t.price) ELSE 0 END), 0) as bank_expenses,
            -- Credit card transactions (excluding Bank and Income categories)
            -- Note: price is already the per-installment amount (combineInstallments: false)
            COALESCE(SUM(
              CASE WHEN COALESCE(t.category, 'Uncategorized') NOT IN ('Bank', 'Income') THEN ABS(t.price) ELSE 0 END
            ), 0) as card_expenses
          FROM transactions t
          ${credentialJoin}
          ${whereClause}
          GROUP BY TO_CHAR(t.date, 'YYYY-MM'), t.vendor, vc.nickname
        )
        SELECT 
          month,
          vendor,
          vendor_nickname,
          ROUND(bank_income::numeric, 0) as bank_income,
          ROUND(bank_expenses::numeric, 0) as bank_expenses,
          ROUND(card_expenses::numeric, 0) as card_expenses,
          ROUND((bank_income - bank_expenses - card_expenses)::numeric, 0) as net_balance
        FROM monthly_data
        ORDER BY month DESC, vendor
      `,
      params
    };
  },
});

export default handler;
