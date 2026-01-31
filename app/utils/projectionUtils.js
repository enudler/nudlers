import { formatISODate, getLocalMidnight } from './dateUtils.js';

/**
 * Normalizes transaction dates for projection by gathering transactions that belong to the same card
 * and clustering them if they occur within a specific window (e.g. 2 days) to account for timezone shifts or inconsistencies.
 * 
 * @param {Array} transactions - Array of transaction objects
 */
export function normalizeTransactionDates(transactions) {
    const cardGroups = {};
    transactions.forEach(row => {
        const key = `${row.account_number}-${row.vendor}-${row.last4}`;
        if (!cardGroups[key]) cardGroups[key] = [];

        // Normalize row date to local midnight
        const d = new Date(row.processed_date || row.date);
        d.setHours(0, 0, 0, 0);
        row.normalizedDate = d;
        cardGroups[key].push(row);
    });

    Object.values(cardGroups).forEach(rows => {
        // Sort by date
        rows.sort((a, b) => a.normalizedDate.getTime() - b.normalizedDate.getTime());

        // Cluster rows that are within 5 days of each other
        const clusters = [];
        if (rows.length > 0) {
            let currentCluster = [rows[0]];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const prev = currentCluster[currentCluster.length - 1];
                const diffTime = Math.abs(row.normalizedDate.getTime() - prev.normalizedDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays < 2) {
                    currentCluster.push(row);
                } else {
                    clusters.push(currentCluster);
                    currentCluster = [row];
                }
            }
            clusters.push(currentCluster);
        }

        // Unify dates within each cluster
        clusters.forEach(cluster => {
            if (cluster.length <= 1) return;

            // Find most frequent date
            const counts = {};
            cluster.forEach(r => {
                const t = r.normalizedDate.getTime();
                counts[t] = (counts[t] || 0) + 1;
            });

            // Pick best (most frequent, tie-break: earliest)
            let bestTime = null;
            let maxCount = -1;

            Object.keys(counts).forEach(ts => {
                const t = parseInt(ts);
                const count = counts[ts];
                if (count > maxCount) {
                    maxCount = count;
                    bestTime = t;
                } else if (count === maxCount) {
                    // tie-break: earliest
                    if (bestTime === null || t < bestTime) {
                        bestTime = t;
                    }
                }
            });

            const consensusDate = new Date(bestTime);
            cluster.forEach(r => {
                r.normalizedDate = consensusDate;
            });
        });
    });
}

/**
 * Generates only the dates within the projection window that match a specific day of month.
 * Handles end-of-month logic (e.g. if day is 31 and month has 30 days, returns 30th).
 * 
 * @param {number} dayOfMonth - User specified day (1-31)
 * @param {Date} start - Start date of projection
 * @param {number} days - Number of days to project
 * @returns {Date[]} Array of dates
 */
function getExampleDates(dayOfMonth, start, days) {
    const dates = [];
    const end = new Date(start);
    end.setDate(start.getDate() + days);

    // Make a copy to iterate
    let current = new Date(start);
    // Align to midnight
    current.setHours(0, 0, 0, 0);

    // Safety check
    if (days > 365) days = 365;

    // Iterate through days is safer/easier for small N (30-90) than complex month logic
    for (let i = 0; i <= days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        d.setHours(0, 0, 0, 0);

        const year = d.getFullYear();
        const month = d.getMonth();
        const datesInMonth = new Date(year, month + 1, 0).getDate();

        // Target day for this month
        const targetDay = Math.min(dayOfMonth, datesInMonth);

        if (d.getDate() === targetDay) {
            dates.push(d);
        }
    }
    return dates;
}

/**
 * Generates the financial projection.
 * 
 * @param {Array} accounts - Accounts with current balances
 * @param {Array} bankRecurring - Detected bank recurring payments (next_payment_date required)
 * @param {Array} manualRecurring - Manual recurring payments (day_of_month required)
 * @param {Array} ccPayments - Future credit card payments (normalizedDate required)
 * @param {number} days - Number of days to project (default 30)
 * @returns {Array} Array of projection objects
 */
export function generateProjection(accounts, bankRecurring, manualRecurring, ccPayments, days = 30, startDate = null) {
    const today = startDate ? getLocalMidnight(startDate) : getLocalMidnight();
    const eventMap = new Map(); // timestamp -> Array<Item>

    function addEvent(date, item) {
        if (!date || isNaN(date.getTime())) return;
        const key = date.getTime();
        if (!eventMap.has(key)) {
            eventMap.set(key, []);
        }
        eventMap.get(key).push(item);
    }

    // 1. Bank Recurring
    if (bankRecurring && Array.isArray(bankRecurring)) {
        bankRecurring.forEach(rp => {
            if (!rp.next_payment_date) return;
            const d = getLocalMidnight(rp.next_payment_date);

            // Only include if within range
            const maxDate = new Date(today);
            maxDate.setDate(today.getDate() + days);

            if (d >= today && d <= maxDate) {
                addEvent(d, {
                    type: 'bank',
                    name: rp.name,
                    amount: rp.price,
                    category: rp.category,
                    account_number: rp.account_number
                });
            }
        });
    }

    // 2. Manual Recurring
    if (manualRecurring && Array.isArray(manualRecurring)) {
        manualRecurring.forEach(mr => {
            const day = mr.day_of_month;
            if (day) {
                const dates = getExampleDates(day, today, days);
                dates.forEach(d => {
                    const accNum = mr.account_number || accounts[0]?.account_number;
                    addEvent(d, {
                        type: 'manual',
                        name: mr.name,
                        amount: mr.amount,
                        category: mr.category,
                        account_number: accNum,
                        is_manual: true
                    });
                });
            }
        });
    }

    // 3. CC Payments
    if (ccPayments && Array.isArray(ccPayments)) {
        ccPayments.forEach(cc => {
            if (!cc.normalizedDate) return;
            const d = cc.normalizedDate; // Should already be midnight via normalizeTransactionDates

            const targetBankId = cc.linked_bank_account_id;
            const targetAccount = accounts.find(a => a.credential_id === targetBankId);

            if (targetAccount) {
                addEvent(d, {
                    type: 'cc',
                    name: cc.card_name,
                    last4: cc.last4,
                    vendor: cc.vendor,
                    price: parseFloat(cc.price),
                    account_number: targetAccount.account_number
                });
            }
        });
    }

    // 4. Build Projection
    const projection = [];
    const currentAccountBalances = {};
    accounts.forEach(acc => {
        currentAccountBalances[acc.account_number] = acc.balance;
    });

    for (let i = 0; i <= days; i++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + i);
        const dateStr = formatISODate(currentDate);
        const dateTs = currentDate.getTime();

        const dailyBankRecurring = [];
        const ccGroupMap = new Map(); // Group by card

        // We only apply transactions for future days (i > 0)
        // i=0 is today, usually we show partial or full balance. 
        // Adhering to previous logic: transactions are applied if i > 0.

        if (i > 0) {
            const events = eventMap.get(dateTs) || [];

            events.forEach(event => {
                if (event.type === 'bank' || event.type === 'manual') {
                    if (currentAccountBalances[event.account_number] !== undefined) {
                        dailyBankRecurring.push({
                            name: event.name,
                            amount: event.amount,
                            category: event.category,
                            account_number: event.account_number,
                            is_manual: event.is_manual
                        });
                        currentAccountBalances[event.account_number] += event.amount;
                    }
                } else if (event.type === 'cc') {
                    const key = `${event.account_number}-${event.vendor}-${event.last4}`;
                    if (!ccGroupMap.has(key)) {
                        ccGroupMap.set(key, {
                            name: event.name,
                            last4: event.last4,
                            amount: 0,
                            vendor: event.vendor,
                            account_number: event.account_number,
                            count: 0
                        });
                    }
                    const grouped = ccGroupMap.get(key);
                    grouped.amount += event.price;
                    grouped.count += 1;

                    currentAccountBalances[event.account_number] += event.price;
                }
            });
        }

        const dailyCCPayments = Array.from(ccGroupMap.values()).map(item => ({
            ...item,
            displayName: `${item.name} ..${item.last4}`
        }));

        const totalBalance = Object.values(currentAccountBalances).reduce((sum, b) => sum + b, 0);

        const dailyChange = (i === 0) ? 0 : (
            dailyBankRecurring.reduce((sum, item) => sum + item.amount, 0) +
            dailyCCPayments.reduce((sum, item) => sum + item.amount, 0)
        );

        projection.push({
            date: dateStr,
            balances: { ...currentAccountBalances },
            totalBalance,
            bankRecurring: dailyBankRecurring,
            ccPayments: dailyCCPayments,
            dailyChange
        });
    }

    return projection;
}
