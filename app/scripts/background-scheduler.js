import { runBackgroundSync } from './background-sync.js';
import logger from '../utils/logger.js';

function getNextOccurrence(hour) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);

    if (next <= now) {
        next.setDate(next.getDate() + 1);
    }

    return next;
}

async function startScheduler() {
    logger.info('[Background Scheduler] Started');

    const scheduleHours = [0, 12]; // 12 AM and 12 PM

    const checkTime = async () => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Check if it is exactly the scheduled hour and minute 0
        if (scheduleHours.includes(currentHour) && currentMinute === 0) {
            logger.info({ hour: currentHour }, '[Background Scheduler] Triggering manual sync');
            try {
                await runBackgroundSync();
            } catch (err) {
                logger.error({ error: err.message }, '[Background Scheduler] Error during background sync');
            }

            // Sleep for 61 seconds to avoid triggering multiple times in the same minute
            await new Promise(resolve => setTimeout(resolve, 61000));
        }
    };

    // Initial log of next runs
    scheduleHours.forEach(hour => {
        const next = getNextOccurrence(hour);
        logger.info({ hour, next: next.toISOString() }, '[Background Scheduler] Next scheduled run');
    });

    // Run check every 30 seconds
    setInterval(checkTime, 30000);
}

startScheduler();
