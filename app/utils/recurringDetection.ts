/**
 * Interface for a transaction object used in recurring detection
 */
export interface DetectionTransaction {
    name: string;
    price: number;
    category: string | null;
    vendor?: string;
    account_number: string | null;
    date: string | Date;
    processed_date?: string | Date;
    transaction_type?: string | null;
    bank_nickname?: string | null;
    bank_account_display?: string | null;
}

/**
 * Interface for a detected recurring payment
 */
export interface DetectedRecurringPayment {
    name: string;
    category: string | null;
    vendor?: string;
    account_number: string | null;
    monthly_amount: number;
    price: number;
    month_count: number;
    last_charge_date: Date;
    last_billing_date?: Date;
    frequency: 'monthly' | 'bi-monthly';
    months: string[];
    occurrences: Array<{ date: Date, amount: number }>;
    next_payment_date: Date;
    transaction_type?: string | null;
    bank_nickname?: string | null;
    bank_account_display?: string | null;
}

/**
 * Detects recurring payments from a list of transactions.
 * Uses fuzzy amount matching and supports monthly/bi-monthly patterns.
 * 
 * @param {DetectionTransaction[]} transactions - List of transaction objects
 * @returns {DetectedRecurringPayment[]} - List of detected recurring payments
 */
export function detectRecurringPayments(transactions: DetectionTransaction[]): DetectedRecurringPayment[] {
    // 1. Group by normalized name and card
    const groups: Record<string, any[]> = {};
    transactions.forEach(t => {
        const normalizedName = t.name.toLowerCase().trim();
        const cardId = t.account_number || t.vendor || 'unknown';
        const key = `${normalizedName}|${cardId}`;

        if (!groups[key]) groups[key] = [];
        groups[key].push({
            ...t,
            date: new Date(t.date),
            price_raw: t.price, // Keep original sign
            price: Math.abs(t.price) // Use absolute for clustering
        });
    });

    const recurringPayments: DetectedRecurringPayment[] = [];

    for (const key in groups) {
        const groupTransactions = groups[key].sort((a, b) => a.date.getTime() - b.date.getTime());
        if (groupTransactions.length < 2) continue;

        // 2. Cluster by amount (fuzzy matching)
        // We use a 10% tolerance for "close enough" amounts or 5 currency units
        const clusters: Array<{ items: any[], totalAmount: number }> = [];
        groupTransactions.forEach(t => {
            let found = false;
            for (const cluster of clusters) {
                const avg = cluster.totalAmount / cluster.items.length;
                const diff = Math.abs(t.price - avg);
                if (diff / avg <= 0.10 || diff <= 5) {
                    cluster.items.push(t);
                    cluster.totalAmount += t.price;
                    found = true;
                    break;
                }
            }
            if (!found) {
                clusters.push({ items: [t], totalAmount: t.price });
            }
        });

        let foundPatterns = false;
        for (const cluster of clusters) {
            if (cluster.items.length < 2) continue;

            const items = cluster.items.sort((a, b) => a.date.getTime() - b.date.getTime());

            const gaps: number[] = [];
            for (let i = 1; i < items.length; i++) {
                const diffDays = Math.round((items[i].date.getTime() - items[i - 1].date.getTime()) / (1000 * 60 * 60 * 24));
                gaps.push(diffDays);
            }

            const monthlyGaps = gaps.filter(g => g >= 25 && g <= 35).length;
            const biMonthlyGaps = gaps.filter(g => g >= 50 && g <= 70).length;

            let frequency: 'monthly' | 'bi-monthly' | null = null;
            if (monthlyGaps >= gaps.length * 0.7) frequency = 'monthly';
            else if (biMonthlyGaps >= gaps.length * 0.7) frequency = 'bi-monthly';

            if (frequency) {
                foundPatterns = true;
                const lastItem = items[items.length - 1];
                const totalRawAmount = items.reduce((sum, it) => sum + it.price_raw, 0);
                const avgRawAmount = totalRawAmount / items.length;

                recurringPayments.push({
                    name: lastItem.name,
                    category: lastItem.category,
                    vendor: lastItem.vendor,
                    account_number: lastItem.account_number,
                    monthly_amount: Math.abs(avgRawAmount),
                    price: avgRawAmount,
                    month_count: items.length,
                    last_charge_date: lastItem.date,
                    last_billing_date: lastItem.processed_date ? new Date(lastItem.processed_date) : undefined,
                    frequency: frequency,
                    months: [...new Set(items.map(it => `${it.date.getFullYear()}-${String(it.date.getMonth() + 1).padStart(2, '0')}`).reverse() as string[])],
                    occurrences: items.map(it => ({ date: it.date, amount: it.price_raw })).reverse(),
                    next_payment_date: calculateNextPayment(lastItem.date, frequency === 'monthly' ? 1 : 2),
                    transaction_type: lastItem.transaction_type,
                    bank_nickname: lastItem.bank_nickname,
                    bank_account_display: lastItem.bank_account_display
                });
            }
        }

        // 3. Fallback: Check if the entire group (variable amounts) shows a strong pattern
        // This is crucial for things like credit card settlements which vary in amount but are regular in time
        if (!foundPatterns) {
            const groupGaps: number[] = [];
            for (let i = 1; i < groupTransactions.length; i++) {
                const diffDays = Math.round((groupTransactions[i].date.getTime() - groupTransactions[i - 1].date.getTime()) / (1000 * 60 * 60 * 24));
                groupGaps.push(diffDays);
            }

            const monthlyGaps = groupGaps.filter(g => g >= 25 && g <= 35).length;
            const biMonthlyGaps = groupGaps.filter(g => g >= 50 && g <= 70).length;

            let frequency: 'monthly' | 'bi-monthly' | null = null;
            if (monthlyGaps >= groupGaps.length * 0.7) frequency = 'monthly';
            else if (biMonthlyGaps >= groupGaps.length * 0.7) frequency = 'bi-monthly';

            if (frequency) {
                const lastItem = groupTransactions[groupTransactions.length - 1];
                const totalRawAmount = groupTransactions.reduce((sum, it) => sum + it.price_raw, 0);
                const avgRawAmount = totalRawAmount / groupTransactions.length;

                recurringPayments.push({
                    name: lastItem.name,
                    category: lastItem.category,
                    vendor: lastItem.vendor,
                    account_number: lastItem.account_number,
                    monthly_amount: Math.abs(avgRawAmount),
                    price: avgRawAmount,
                    month_count: groupTransactions.length,
                    last_charge_date: lastItem.date,
                    last_billing_date: lastItem.processed_date ? new Date(lastItem.processed_date) : undefined,
                    frequency: frequency,
                    months: [...new Set(groupTransactions.map(it => `${it.date.getFullYear()}-${String(it.date.getMonth() + 1).padStart(2, '0')}`).reverse() as string[])],
                    occurrences: groupTransactions.map(it => ({ date: it.date, amount: it.price_raw })).reverse(),
                    next_payment_date: calculateNextPayment(lastItem.date, frequency === 'monthly' ? 1 : 2),
                    transaction_type: lastItem.transaction_type,
                    bank_nickname: lastItem.bank_nickname,
                    bank_account_display: lastItem.bank_account_display
                });
            }
        }
    }

    return recurringPayments;
}

/**
 * Calculates the next payment date based on frequency.
 */
function calculateNextPayment(lastDate: Date, monthsToAdd: number): Date {
    const next = new Date(lastDate);
    next.setMonth(next.getMonth() + monthsToAdd);

    const now = new Date();
    // Ensure we return a future date
    while (next < now) {
        next.setMonth(next.getMonth() + monthsToAdd);
    }

    return next;
}
