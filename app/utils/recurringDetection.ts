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
            price: Math.abs(t.price)
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

        for (const cluster of clusters) {
            if (cluster.items.length < 2) continue;

            const items = cluster.items.sort((a, b) => a.date.getTime() - b.date.getTime());

            // 3. Analyze gaps for frequency
            const gaps: number[] = [];
            for (let i = 1; i < items.length; i++) {
                const diffDays = Math.round((items[i].date.getTime() - items[i - 1].date.getTime()) / (1000 * 60 * 60 * 24));
                gaps.push(diffDays);
            }

            // Check frequency:
            // Monthly: gaps are mostly around 30 days (25-35 range)
            // Bi-monthly: gaps are mostly around 60 days (50-70 range)

            const monthlyGaps = gaps.filter(g => g >= 25 && g <= 35).length;
            const biMonthlyGaps = gaps.filter(g => g >= 50 && g <= 70).length;

            let frequency: 'monthly' | 'bi-monthly' | null = null;
            if (monthlyGaps >= gaps.length * 0.7) {
                frequency = 'monthly';
            } else if (biMonthlyGaps >= gaps.length * 0.7) {
                frequency = 'bi-monthly';
            }

            if (frequency) {
                const lastItem = items[items.length - 1];
                const avgAmount = cluster.totalAmount / cluster.items.length;

                recurringPayments.push({
                    name: lastItem.name,
                    category: lastItem.category,
                    vendor: lastItem.vendor,
                    account_number: lastItem.account_number,
                    monthly_amount: avgAmount,
                    price: -avgAmount, // For UI consistency
                    month_count: items.length,
                    last_charge_date: lastItem.date,
                    frequency: frequency,
                    months: [...new Set(items.map(it => it.date.toISOString().substring(0, 7)).reverse() as string[])],
                    occurrences: items.map(it => ({ date: it.date, amount: it.price })).reverse(),
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
