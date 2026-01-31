/**
 * Formats a date as YYYY-MM-DD in local time.
 * This avoids the common issue where toISOString() shifts the date due to UTC conversion.
 * @param {Date|string|number} date 
 * @returns {string} YYYY-MM-DD
 */
export function formatISODate(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Returns today's date as YYYY-MM-DD in local time.
 * @returns {string} YYYY-MM-DD
 */
export function getTodayISODate() {
    return formatISODate(new Date());
}

/**
 * Returns a new Date object set to local midnight for the given date.
 * @param {Date|string|number} date 
 * @returns {Date}
 */
export function getLocalMidnight(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}
