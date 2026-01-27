import { createApiHandler } from "../utils/apiHandler";
import { getDB } from "../db";
import { getBillingCycleSql } from "../../../utils/transaction_logic";
import { BANK_VENDORS } from "../../../utils/constants";

const handler = createApiHandler({
  query: async (req) => {
    const {
      startDate, endDate, vendor, groupBy, billingCycle,
      excludeBankTransactions, limit = 50, offset = 0,
      sortBy = 'card_expenses', sortOrder = 'desc'
    } = req.query;

    const limitVal = parseInt(limit);
    const offsetVal = parseInt(offset);

    // Build WHERE clause based on filters
    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    // ... (billingCycle and startDate/endDate logic remains same)
    if (billingCycle) {
      const client = await getDB();
      let billingStartDay = 10;
      try {
        const settingsResult = await client.query("SELECT value FROM app_settings WHERE key = 'billing_cycle_start_day'");
        if (settingsResult.rows.length > 0) {
          billingStartDay = parseInt(settingsResult.rows[0].value);
        }
      } finally {
        client.release();
      }

      const effectiveMonthSql = getBillingCycleSql(billingStartDay, 't.date', 't.processed_date');
      whereClause = `WHERE (${effectiveMonthSql}) = $${paramIndex}`;
      params.push(billingCycle);
      paramIndex++;
    }
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

    if (excludeBankTransactions === 'true') {
      const bankExclusion = `t.vendor NOT IN (${BANK_VENDORS.map(v => `'${v}'`).join(', ')})`;
      if (whereClause) {
        whereClause += ` AND ${bankExclusion}`;
      } else {
        whereClause = `WHERE ${bankExclusion}`;
      }
    }

    const credentialJoin = `
      LEFT JOIN card_ownership co ON t.vendor = co.vendor AND RIGHT(t.account_number, 4) = RIGHT(co.account_number, 4)
      LEFT JOIN vendor_credentials vc ON co.credential_id = vc.id
    `;

    // Determine ORDER BY clause
    let orderClause = '';
    const dir = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    if (groupBy === 'description') {
      if (sortBy === 'name') orderClause = `t.name ${dir}`;
      else if (sortBy === 'category') orderClause = `t.category ${dir}, t.name ASC`;
      else if (sortBy === 'count' || sortBy === 'transaction_count') orderClause = `COUNT(DISTINCT (t.identifier, t.vendor)) ${dir}, t.name ASC`;
      else orderClause = `ABS(COALESCE(SUM(t.price), 0)) ${dir}, t.name ASC`;
    } else if (groupBy === 'last4digits') {
      if (sortBy === 'name') orderClause = `COALESCE(RIGHT(t.account_number, 4), 'Unknown') ${dir}`;
      else if (sortBy === 'count' || sortBy === 'transaction_count') orderClause = `COUNT(DISTINCT (t.identifier, t.vendor)) ${dir}, COALESCE(RIGHT(t.account_number, 4), 'Unknown') ASC`;
      else orderClause = `(
        COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price > 0 THEN t.price ELSE 0 END), 0) +
        COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price < 0 THEN ABS(t.price) ELSE 0 END), 0) +
        COALESCE(SUM(
          CASE WHEN COALESCE(t.category, 'Uncategorized') NOT IN ('Bank', 'Income') THEN ABS(t.price) ELSE 0 END
        ), 0)
      ) ${dir}, COALESCE(RIGHT(t.account_number, 4), 'Unknown') ASC`;
    } else {
      if (sortBy === 'name') orderClause = `month ${dir}, vendor ASC`;
      else orderClause = `month ${dir}, vendor ASC`; // Default for monthly
    }

    let sql;
    if (groupBy === 'description') {
      sql = `
        SELECT 
          t.name as description,
          t.category,
          COUNT(DISTINCT (t.identifier, t.vendor)) as transaction_count,
          COALESCE(SUM(t.price), 0)::numeric as amount,
          COUNT(*) OVER() as total_count
        FROM transactions t
        ${credentialJoin}
        ${whereClause}
        GROUP BY t.name, t.category
        ORDER BY ${orderClause}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
    } else if (groupBy === 'last4digits') {
      sql = `
        SELECT 
          COALESCE(RIGHT(t.account_number, 4), 'Unknown') as last4digits,
          COUNT(DISTINCT (t.identifier, t.vendor)) as transaction_count,
          COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price > 0 THEN t.price ELSE 0 END), 0)::numeric as bank_income,
          COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price < 0 THEN ABS(t.price) ELSE 0 END), 0)::numeric as bank_expenses,
          COALESCE(SUM(
            CASE WHEN COALESCE(t.category, 'Uncategorized') NOT IN ('Bank', 'Income') THEN ABS(t.price) ELSE 0 END
          ), 0)::numeric as card_expenses,
          COALESCE(SUM(CASE WHEN t.price > 0 THEN t.price ELSE 0 END), 0)::numeric as total_income,
          COALESCE(SUM(CASE WHEN t.price < 0 THEN ABS(t.price) ELSE 0 END), 0)::numeric as total_outflow,
          (
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price > 0 THEN t.price ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price < 0 THEN ABS(t.price) ELSE 0 END), 0) -
            COALESCE(SUM(
              CASE WHEN COALESCE(t.category, 'Uncategorized') NOT IN ('Bank', 'Income') THEN ABS(t.price) ELSE 0 END
            ), 0)
          )::numeric as net_balance,
          COALESCE(ba.id, vc.id) as bank_account_id,
          COALESCE(ba.nickname, co.custom_bank_account_nickname, vc.nickname) as bank_account_nickname,
          COALESCE(ba.bank_account_number, co.custom_bank_account_number, co.account_number) as bank_account_number,
          co.custom_bank_account_number,
          co.custom_bank_account_nickname,
          COALESCE(ba.vendor, vc.vendor) as bank_account_vendor,
          t.vendor as transaction_vendor,
          co.balance,
          co.balance_updated_at,
          COUNT(*) OVER() as total_count
        FROM transactions t
        ${credentialJoin}
        LEFT JOIN vendor_credentials ba ON co.linked_bank_account_id = ba.id
        ${whereClause}
        GROUP BY COALESCE(RIGHT(t.account_number, 4), 'Unknown'), t.vendor, ba.id, ba.nickname, ba.bank_account_number, ba.vendor, co.custom_bank_account_nickname, co.custom_bank_account_number, co.balance, co.balance_updated_at, vc.id, vc.nickname, vc.vendor, co.account_number
        ORDER BY ${orderClause}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
    } else {
      sql = `
        WITH monthly_data AS (
          SELECT 
            TO_CHAR(t.date, 'YYYY-MM') as month,
            t.vendor,
            vc.nickname as vendor_nickname,
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price > 0 THEN t.price ELSE 0 END), 0) as bank_income,
            COALESCE(SUM(CASE WHEN t.category = 'Bank' AND t.price < 0 THEN ABS(t.price) ELSE 0 END), 0) as bank_expenses,
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
          bank_income::numeric as bank_income,
          bank_expenses::numeric as bank_expenses,
          card_expenses::numeric as card_expenses,
          (bank_income - bank_expenses - card_expenses)::numeric as net_balance,
          COUNT(*) OVER() as total_count
        FROM monthly_data
        ORDER BY ${orderClause}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
    }

    params.push(limitVal, offsetVal);

    return { sql, params };
  },
  transform: (result) => {
    const rows = result.rows;
    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const items = rows.map(r => {
      const { total_count, ...item } = r;
      return item;
    });
    return { items, total };
  }
});

export default handler;
