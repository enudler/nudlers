import { getDB } from "../db";
import { detectRecurringPayments } from "../../../utils/recurringDetection";
import { BANK_VENDORS } from "../../../utils/constants";
import logger from "../../../utils/logger";
import { formatISODate } from "../../../utils/dateUtils";
import { normalizeTransactionDates } from "../../../utils/projectionUtils";

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const client = await getDB();
    try {
        // 1. Get current balance and credential IDs for all bank accounts
        const balanceResult = await client.query(`
            SELECT 
                co.id,
                co.account_number,
                co.balance,
                co.balance_updated_at,
                vc.nickname,
                vc.id as credential_id
            FROM card_ownership co
            JOIN vendor_credentials vc ON co.credential_id = vc.id
            WHERE co.vendor = ANY($1) AND (co.is_hidden = false OR co.is_hidden IS NULL)
        `, [BANK_VENDORS]);

        const accounts = balanceResult.rows.map(row => ({
            id: row.id,
            account_number: row.account_number,
            balance: parseFloat(row.balance || 0),
            nickname: row.nickname,
            credential_id: row.credential_id
        }));

        const startingTotalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

        const accountMetadata = {};
        accounts.forEach(acc => {
            accountMetadata[acc.account_number] = {
                nickname: acc.nickname,
                account_number: acc.account_number,
                credential_id: acc.credential_id
            };
        });

        // 2. Identify Bank recurring payments - filtering out exclusions
        const bankTransactions = await client.query(`
            WITH excluded AS (
                SELECT LOWER(TRIM(name)) as name, account_number
                FROM non_recurring_exclusions
            )
            SELECT t.name, t.price, t.category, t.vendor, t.account_number, t.date, t.processed_date, t.transaction_type
            FROM transactions t
            WHERE t.transaction_type = 'bank'
              AND t.date >= CURRENT_DATE - INTERVAL '180 days'
              AND t.category NOT IN ('Bank', 'Income')
              AND NOT EXISTS (
                  SELECT 1 FROM excluded e 
                  WHERE LOWER(TRIM(t.name)) = e.name 
                    AND (e.account_number IS NULL OR e.account_number = t.account_number)
              )
            ORDER BY t.date DESC
        `);

        const allRecurring = detectRecurringPayments(bankTransactions.rows);

        // 3. Get manual recurring payments
        const manualRecurringResult = await client.query(`
            SELECT name, amount, category, account_number, day_of_month, frequency
            FROM manual_recurring_payments
            WHERE is_active = true
        `);
        const manualRecurring = manualRecurringResult.rows;

        // 4. Get future credit card transactions and their target bank account
        const futureCCPayments = await client.query(`
            SELECT 
                t.name, t.price, t.date, t.processed_date, t.vendor, t.account_number, t.category,
                co.linked_bank_account_id,
                COALESCE(cv.card_nickname, vc_card.nickname, t.vendor) as card_name,
                RIGHT(t.account_number, 4) as last4
            FROM transactions t
            LEFT JOIN card_ownership co ON t.vendor = co.vendor AND RIGHT(t.account_number, 4) = RIGHT(co.account_number, 4)
            LEFT JOIN vendor_credentials vc_card ON co.credential_id = vc_card.id
            LEFT JOIN vendor_credentials vc_bank ON co.linked_bank_account_id = vc_bank.id
            LEFT JOIN card_vendors cv ON RIGHT(t.account_number, 4) = cv.last4_digits AND t.vendor = cv.card_vendor
            WHERE t.transaction_type = 'credit_card'
              AND (
                (t.processed_date >= CURRENT_DATE) 
                OR 
                (t.processed_date IS NULL AND t.date >= CURRENT_DATE)
              )
            AND COALESCE(t.processed_date, t.date) <= CURRENT_DATE + INTERVAL '35 days'
        `);

        // Fix timezone inconsistencies or date drifts
        normalizeTransactionDates(futureCCPayments.rows);

        // 4. Generate 30-day projection per account
        const projection = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const currentAccountBalances = {};
        accounts.forEach(acc => {
            currentAccountBalances[acc.account_number] = acc.balance;
        });

        for (let i = 0; i <= 30; i++) {
            const currentDate = new Date(today);
            currentDate.setDate(today.getDate() + i);
            const dateStr = formatISODate(currentDate);

            const dailyBankRecurring = [];
            const ccMap = new Map();

            if (i > 0) {
                // Bank recurring
                allRecurring.forEach(rp => {
                    const nextDate = new Date(rp.next_payment_date);
                    nextDate.setHours(0, 0, 0, 0);

                    if (nextDate.getTime() === currentDate.getTime()) {
                        const accNum = rp.account_number;
                        if (currentAccountBalances[accNum] !== undefined) {
                            dailyBankRecurring.push({
                                name: rp.name,
                                amount: rp.price,
                                category: rp.category,
                                account_number: accNum
                            });
                            currentAccountBalances[accNum] += rp.price;
                        }
                    }
                });

                // Manual recurring
                manualRecurring.forEach(mr => {
                    const day = mr.day_of_month;
                    // Simplistic monthly check
                    if (currentDate.getDate() === day) {
                        const accNum = mr.account_number || accounts[0]?.account_number; // Default to first if not specified
                        if (currentAccountBalances[accNum] !== undefined) {
                            dailyBankRecurring.push({
                                name: mr.name,
                                amount: mr.amount,
                                category: mr.category,
                                account_number: accNum,
                                is_manual: true
                            });
                            currentAccountBalances[accNum] += mr.amount;
                        }
                    }
                });

                // CC settlements
                futureCCPayments.rows.forEach(cc => {
                    const procDate = cc.normalizedDate;

                    if (procDate.getTime() === currentDate.getTime()) {
                        const targetBankId = cc.linked_bank_account_id;
                        const targetAccount = accounts.find(a => a.credential_id === targetBankId);

                        if (targetAccount) {
                            const price = parseFloat(cc.price);
                            const accNum = targetAccount.account_number;

                            const key = `${accNum}-${cc.vendor}-${cc.last4}`;
                            if (!ccMap.has(key)) {
                                ccMap.set(key, {
                                    name: cc.card_name,
                                    last4: cc.last4,
                                    amount: 0,
                                    vendor: cc.vendor,
                                    account_number: accNum,
                                    count: 0
                                });
                            }
                            const grouped = ccMap.get(key);
                            grouped.amount += price;
                            grouped.count += 1;

                            currentAccountBalances[accNum] += price;
                        }
                    }
                });
            }

            const dailyCCPayments = Array.from(ccMap.values()).map(item => ({
                ...item,
                displayName: `${item.name} ..${item.last4}`
            }));

            const totalBalance = Object.values(currentAccountBalances).reduce((sum, b) => sum + b, 0);

            projection.push({
                date: dateStr,
                balances: { ...currentAccountBalances },
                totalBalance,
                bankRecurring: dailyBankRecurring,
                ccPayments: dailyCCPayments,
                dailyChange: (i === 0) ? 0 : (dailyBankRecurring.reduce((sum, item) => sum + item.amount, 0) + dailyCCPayments.reduce((sum, item) => sum + item.amount, 0))
            });
        }

        res.status(200).json({
            summary: {
                startingBalance: startingTotalBalance,
                endingBalance: projection[projection.length - 1].totalBalance,
                periodDays: 30
            },
            projection,
            accounts,
            accountMetadata
        });
    } catch (error) {
        logger.error({ error: error.message, stack: error.stack }, "Error generating projection");
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}
