
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
