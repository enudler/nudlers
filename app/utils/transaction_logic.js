/**
 * Generates a SQL fragment to determine the "Effective Billing Month" (YYYY-MM) for a transaction.
 * 
 * Logic:
 * 1. If processed_date exists, use it.
 * 2. If processed_date is NULL:
 *    - If transaction day >= startDay: It belongs to next month's bill.
 *    - If transaction day < startDay: It belongs to this month's bill.
 * 
 * @param {number} startDay - The billing cycle start day (default 10)
 * @param {string} dateCol - The name of the date column (default 'date')
 * @param {string} processedDateCol - The name of the processed_date column (default 'processed_date')
 * @returns {string} The SQL fragment returning a 'YYYY-MM' string
 */
export function getBillingCycleSql(startDay = 10, dateCol = 'date', processedDateCol = 'processed_date') {
    return `
        TO_CHAR(
            CASE 
                /* 1. If we have a specific billing date (processed_date) that differs from the transaction date,
                   it already represents a determined billing moment. We only shift it if it's strictly 
                   AFTER the startDay (e.g., if billed on the 11th when cycle starts on 10th, it belongs to next month).
                   But if it's ON the 10th, it belongs to the month it's in. */
                WHEN ${processedDateCol} IS NOT NULL AND ${processedDateCol} != ${dateCol}
                THEN (
                    CASE 
                        WHEN EXTRACT(DAY FROM ${processedDateCol}) > ${startDay} 
                        THEN (${processedDateCol} + INTERVAL '1 month')
                        ELSE ${processedDateCol}
                    END
                )
                /* 2. Standard logic for new transactions or bank transactions (where date == processed_date):
                   Anything on or after the startDay belongs to the next month's bill. */
                WHEN EXTRACT(DAY FROM COALESCE(${processedDateCol}, ${dateCol})) >= ${startDay} 
                THEN (COALESCE(${processedDateCol}, ${dateCol}) + INTERVAL '1 month')
                ELSE COALESCE(${processedDateCol}, ${dateCol})
            END, 
            'YYYY-MM'
        )
    `;
}
