import { getDB } from "../db";
import logger from '../../../utils/logger.js';
import { getBillingCycleSql } from "../../../utils/transaction_logic";
import { detectRecurringPayments } from "../../../utils/recurringDetection";
import { BANK_VENDORS } from "../../../utils/constants";

export default async function handler(req, res) {
    const client = await getDB();

    try {
        // 1. Get settings
        let billingStartDay = 10;
        let dbPayrollDay = null;
        const settingsResult = await client.query("SELECT key, value FROM app_settings WHERE key IN ('billing_cycle_start_day', 'payroll_day')");
        settingsResult.rows.forEach(row => {
            const rawValue = row.value;
            const stringValue = typeof rawValue === 'string' ? rawValue.replace(/"/g, '') : String(rawValue);
            const val = parseInt(stringValue);
            if (!isNaN(val)) {
                if (row.key === 'billing_cycle_start_day') billingStartDay = val;
                if (row.key === 'payroll_day') dbPayrollDay = val;
            }
        });

        // Use query param if provided, otherwise fallback to DB setting, otherwise default to 1
        const payrollDay = req.query.payrollDay ? parseInt(req.query.payrollDay) : (dbPayrollDay || 1);

        // 2. Determine target month
        const now = new Date();
        const currentDay = now.getDate();
        let targetDate = new Date(now);
        if (currentDay >= billingStartDay) {
            targetDate.setMonth(targetDate.getMonth() + 1);
        }
        const targetMonth = targetDate.toISOString().substring(0, 7); // YYYY-MM

        // 3. Get all bank accounts with their credential_id
        const accountsResult = await client.query(`
      SELECT 
        id, vendor, account_number, balance, balance_updated_at,
        custom_bank_account_nickname as nickname,
        credential_id
      FROM card_ownership
      WHERE vendor IN (${BANK_VENDORS.map(v => `'${v}'`).join(', ')})
    `);

        // 4. Get all credit cards and their linked bank accounts (linking to credential_id)
        const cardsResult = await client.query(`
      SELECT 
        id as ownership_id, vendor, account_number, linked_bank_account_id, 
        custom_bank_account_nickname as nickname
      FROM card_ownership
      WHERE vendor NOT IN (${BANK_VENDORS.map(v => `'${v}'`).join(', ')})
    `);

        // 5. Get all transactions for the target month
        const effectiveMonthSql = getBillingCycleSql(billingStartDay, 't.date', 't.processed_date');
        const transactionsResult = await client.query(`
      SELECT t.*
      FROM transactions t
      WHERE (${effectiveMonthSql}) = $1
    `, [targetMonth]);

        const targetMonthTransactions = transactionsResult.rows;

        // 6. Get recurring payments detection
        const candidatesResult = await client.query(`
      WITH known_installments AS (
        SELECT DISTINCT LOWER(TRIM(name)) as name
        FROM transactions
        WHERE installments_total > 1
      ),
      excluded_recurring AS (
        SELECT LOWER(TRIM(name)) as name, account_number
        FROM non_recurring_exclusions
      )
      SELECT
        t.name, t.price, t.category, t.vendor, t.account_number, t.date, t.processed_date, t.transaction_type
      FROM transactions t
      WHERE t.price != 0
        AND (t.installments_total IS NULL OR t.installments_total <= 1)
        AND t.category != 'Bank'
        AND LOWER(TRIM(t.name)) NOT IN (SELECT name FROM known_installments)
        AND NOT EXISTS (
          SELECT 1 FROM excluded_recurring e
          WHERE LOWER(TRIM(t.name)) = e.name
            AND (e.account_number IS NULL OR e.account_number = t.account_number)
        )
      ORDER BY t.date DESC
    `);

        const detectedRecurring = detectRecurringPayments(candidatesResult.rows);

        // 7. Calculate projection for each bank account
        const processedCredentials = new Set();
        const projectionItems = accountsResult.rows.map(bankAcc => {
            const bankId = bankAcc.id;

            // SECURITY: Only deduct CC charges from the FIRST bank account found for a given credential
            // to avoid doubling charges if the user has multiple sub-accounts for the same bank.
            const isMainAccountForCred = !processedCredentials.has(bankAcc.credential_id);
            processedCredentials.add(bankAcc.credential_id);

            let ccDeduction = 0;
            const cardDetails = [];

            if (isMainAccountForCred) {
                // Sum transactions for linked cards
                // Note: card.linked_bank_account_id contains the vendor_credential.id
                const linkedCards = cardsResult.rows.filter(card => card.linked_bank_account_id === bankAcc.credential_id);

                linkedCards.forEach(card => {
                    const cardTrx = targetMonthTransactions.filter(t => {
                        const tLast4 = t.account_number ? t.account_number.slice(-4) : '';
                        const cLast4 = card.account_number ? card.account_number.slice(-4) : '';
                        return t.vendor.toLowerCase() === card.vendor.toLowerCase() && tLast4 === cLast4 && tLast4 !== '';
                    });

                    const cardSum = cardTrx.reduce((sum, t) => sum + parseFloat(t.price), 0);
                    ccDeduction += cardSum;
                    cardDetails.push({
                        cardName: card.nickname || `${card.vendor} •••• ${card.account_number?.slice(-4) || '???'}`,
                        cardNumber: card.account_number,
                        pendingAmount: cardSum
                    });
                });
            }

            // Sum bank transactions for this account that are already in target month
            const bankTrx = targetMonthTransactions.filter(t =>
                t.transaction_type === 'bank' &&
                (t.account_number || '').slice(-4) === (bankAcc.account_number || '').slice(-4)
            );
            const bankTrxSum = bankTrx.reduce((sum, t) => sum + parseFloat(t.price), 0);

            // Predicted recurring payments
            let recurringDeduction = 0;
            const recurringDetails = [];

            const applyToThisAccount = detectedRecurring.filter(r => {
                const isOnBank = (r.account_number && bankAcc.account_number && r.account_number.slice(-4) === bankAcc.account_number.slice(-4));

                // Fallback: If it's on a card linked to this account's credential, and this is the main account
                const isOnLinkedCard = isMainAccountForCred && cardsResult.rows.some(c =>
                    c.linked_bank_account_id === bankAcc.credential_id &&
                    c.vendor.toLowerCase() === r.vendor.toLowerCase() &&
                    c.account_number?.slice(-4) === r.account_number?.slice(-4)
                );

                return isOnBank || isOnLinkedCard;
            });

            applyToThisAccount.forEach(r => {
                // Check if this recurring payment already has a transaction in the target month
                const alreadyHasTrx = targetMonthTransactions.some(t => {
                    const tName = (t.name || '').toLowerCase().trim();
                    const rName = (r.name || '').toLowerCase().trim();
                    const tLast4 = (t.account_number || '').slice(-4);
                    const rLast4 = (r.account_number || '').slice(-4);
                    return t.vendor.toLowerCase() === r.vendor.toLowerCase() && tLast4 === rLast4 && tName === rName;
                });

                if (!alreadyHasTrx) {
                    let nextPay = new Date(r.next_payment_date);

                    // If payrollDay is set, override the day for income items that look like payroll
                    const isPayroll = r.price > 0 && (r.name.toLowerCase().includes('payroll') || r.name.includes('משכורת'));
                    if (isPayroll && payrollDay) {
                        nextPay.setDate(payrollDay);
                    }

                    const nextPayMonth = nextPay.toISOString().substring(0, 7);

                    if (nextPayMonth <= targetMonth) {
                        recurringDeduction += r.price;
                        recurringDetails.push({
                            name: r.name,
                            amount: r.price,
                            date: nextPay.toISOString(),
                            isIncome: r.price > 0
                        });
                    }
                }
            });

            return {
                bankAccountId: bankId,
                bankAccountName: bankAcc.nickname || `${bankAcc.vendor} •••• ${bankAcc.account_number?.slice(-4) || '???'}`,
                bankAccountNumber: bankAcc.account_number,
                currentBalance: parseFloat(bankAcc.balance || 0),
                projectedCreditCardDeduction: ccDeduction,
                projectedRecurringDeduction: recurringDeduction,
                bankActivityInCycle: bankTrxSum,
                projectedBalance: parseFloat(bankAcc.balance || 0) + ccDeduction + recurringDeduction + bankTrxSum,
                linkedCards: cardDetails,
                predictedRecurring: recurringDetails
            };
        });

        res.status(200).json({
            projectionDate: targetMonth + "-" + billingStartDay, // Expected charge date
            targetMonth,
            payrollDay,
            billingStartDay,
            items: projectionItems
        });
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, "Error generating projection");
        res.status(500).json({
            error: "Internal Server Error",
            details: error.message
        });
    } finally {
        client.release();
    }
}
