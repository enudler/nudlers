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
                WHEN EXTRACT(DAY FROM COALESCE(${processedDateCol}, ${dateCol})) >= ${startDay} 
                THEN (COALESCE(${processedDateCol}, ${dateCol}) + INTERVAL '1 month')
                ELSE COALESCE(${processedDateCol}, ${dateCol})
            END, 
            'YYYY-MM'
        )
    `;
}
