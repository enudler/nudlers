import { getDB } from './db';
import logger from '../../utils/logger.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await getDB();

  try {
    // Get sync settings
    const settingsResult = await client.query(
      `SELECT key, value FROM app_settings WHERE key IN ('sync_enabled', 'sync_hour', 'sync_days_back')`
    );

    const settings = {};
    for (const row of settingsResult.rows) {
      settings[row.key] = row.value;
    }

    // Get active accounts count
    const accountsResult = await client.query(
      `SELECT COUNT(*) as count FROM vendor_credentials WHERE is_active = true`
    );
    const activeAccounts = parseInt(accountsResult.rows[0].count);

    // Helper function to convert PostgreSQL timestamp to ISO string with UTC timezone
    // CRITICAL: node-postgres returns TIMESTAMP WITHOUT TIME ZONE as Date objects
    // These Date objects are created by interpreting the timestamp in the SERVER's local timezone
    // We need to extract the original timestamp string and treat it as UTC
    const toISOString = (timestamp) => {
      if (!timestamp) return null;

      // If it's already an ISO string with timezone, return as-is
      if (typeof timestamp === 'string' && (timestamp.includes('Z') || timestamp.match(/[+-]\d{2}:?\d{2}$/))) {
        return timestamp;
      }

      // CRITICAL FIX: If it's a Date object from node-postgres, we need to be careful
      // The Date object was created from a TIMESTAMP WITHOUT TIME ZONE, which node-postgres
      // interprets in the server's local timezone. We need to get the UTC representation.
      if (timestamp instanceof Date) {
        // Use toISOString() which always returns UTC
        return timestamp.toISOString();
      }

      // PostgreSQL TIMESTAMP format: "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD HH:mm:ss.sss"
      // node-postgres might return these as strings without timezone
      // We MUST treat them as UTC by appending 'Z' before parsing
      if (typeof timestamp === 'string') {
        // Match PostgreSQL timestamp formats (with or without milliseconds, with space or T)
        const pgTimestampMatch = timestamp.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?/);
        if (pgTimestampMatch) {
          const [, datePart, timePart, millisPart] = pgTimestampMatch;
          // Normalize milliseconds to 3 digits
          let milliseconds = '.000';
          if (millisPart) {
            // Pad or truncate to 3 digits
            const millis = millisPart.substring(1); // Remove the dot
            milliseconds = '.' + millis.padEnd(3, '0').substring(0, 3);
          }
          // Convert to ISO format: YYYY-MM-DDTHH:mm:ss.sssZ (explicitly UTC)
          const isoString = `${datePart}T${timePart}${milliseconds}Z`;
          // Verify it parses correctly
          const testDate = new Date(isoString);
          if (!isNaN(testDate.getTime())) {
            return isoString;
          }
        }
      }

      // Fallback: try parsing as-is and converting to ISO
      // This might interpret as local time, which is why we prefer the explicit UTC conversion above
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        // If we got here, the timestamp might have been interpreted as local time
        // Log a warning so we can investigate
        logger.warn({ timestamp, timestampType: typeof timestamp, parsed: date.toISOString() }, '[sync_status] Timestamp parsed without explicit UTC');
        return date.toISOString();
      }

      // Log error if we couldn't parse it
      logger.error({ timestamp, timestampType: typeof timestamp }, '[sync_status] Could not parse timestamp');
      return null;
    };

    // Get the most recent scrape event
    // Use PostgreSQL to convert TIMESTAMP to UTC ISO string directly
    // This ensures we get UTC regardless of server timezone
    const latestScrapeResult = await client.query(`
      SELECT 
        id,
        triggered_by,
        vendor,
        start_date,
        status,
        status,
        message,
        report_json,
        CASE 
          WHEN created_at IS NOT NULL 
          THEN to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z'
          ELSE NULL
        END as created_at
      FROM scrape_events
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const latestScrape = latestScrapeResult.rows[0] || null;
    // No need to convert - PostgreSQL already formatted it as ISO string

    // Get recent scrape history (last 10 events)
    const historyResult = await client.query(`
      SELECT 
        id,
        triggered_by,
        vendor,
        start_date,
        status,
        status,
        message,
        report_json,
        CASE 
          WHEN created_at IS NOT NULL 
          THEN to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z'
          ELSE NULL
        END as created_at
      FROM scrape_events
      ORDER BY created_at DESC
      LIMIT 10
    `);
    const history = historyResult.rows;
    // No need to convert - PostgreSQL already formatted it as ISO string

    // Get last synced time for each active account
    const lastSyncedResult = await client.query(`
      SELECT 
        nickname,
        vendor,
        CASE 
          WHEN last_synced_at IS NOT NULL 
          THEN to_char(last_synced_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z'
          ELSE NULL
        END as last_synced_at
      FROM vendor_credentials
      WHERE is_active = true
      ORDER BY last_synced_at DESC NULLS LAST
    `);
    const accountSyncStatus = lastSyncedResult.rows;
    // PostgreSQL formatted it as ISO string with 'Z' suffix

    // Helper to enrich message with fetched count from report_json
    const enrichMessage = (item) => {
      if (item && item.report_json && item.message && item.message.includes('Success')) {
        // If message doesn't already have "fetched=", try to add it
        if (!item.message.includes('fetched=')) {
          const stats = item.report_json;
          // Check if we have transactions count (fetched)
          if (typeof stats.transactions === 'number') {
            // Replace "Success (Chunked): saved=" with "Success (Chunked): fetched=X, saved="
            // Or just prepend if format matches standard
            if (item.message.includes('saved=')) {
              item.message = item.message.replace('saved=', `fetched=${stats.transactions}, saved=`);
            } else {
              // Fallback
              item.message = `${item.message} (fetched=${stats.transactions})`;
            }
          }
        }
      }
      // Remove report_json from output to save bandwidth if not needed by frontend (though frontend might use it?)
      // Frontend SyncStatusModal uses it? No, it uses history list. 
      // Actually, frontend SyncStatusModal DOES NOT use report_json from the list. It fetches report on click.
      // So we can remove it to keep payload small.
      delete item.report_json;
    };

    if (latestScrape) enrichMessage(latestScrape);
    history.forEach(enrichMessage);

    // Calculate overall sync health
    const now = new Date();
    const syncHour = parseInt(settings.sync_hour) || 3;
    const intervalHours = 24; // Implicit daily interval
    let syncHealth = 'unknown';

    if (latestScrape && latestScrape.created_at) {
      // Parse the ISO string (which is in UTC) and compare with current time
      const lastSyncTime = new Date(latestScrape.created_at);
      const hoursSinceSync = (now.getTime() - lastSyncTime.getTime()) / (1000 * 60 * 60);

      if (latestScrape.status === 'completed') {
        if (hoursSinceSync < intervalHours) {
          syncHealth = 'healthy';
        } else if (hoursSinceSync < intervalHours * 2) {
          syncHealth = 'stale';
        } else {
          syncHealth = 'outdated';
        }
      } else if (latestScrape.status === 'started') {
        // If sync has been "started" for more than 20 minutes, consider it stale/failed
        if (hoursSinceSync > 0.33) {
          syncHealth = 'error';
          // Optionally update the message for the UI
          latestScrape.message = 'Sync timed out or process crashed';
        } else {
          syncHealth = 'syncing';
        }
      } else if (latestScrape.status === 'failed') {
        syncHealth = 'error';
      }
    } else if (activeAccounts === 0) {
      syncHealth = 'no_accounts';
    } else {
      syncHealth = 'never_synced';
    }

    res.status(200).json({
      syncHealth,
      settings: {
        enabled: settings.sync_enabled === true || settings.sync_enabled === 'true',
        syncHour: parseInt(settings.sync_hour) || 3,
        daysBack: parseInt(settings.sync_days_back) || 30
      },
      activeAccounts,
      latestScrape: latestScrape,
      history,
      accountSyncStatus
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Sync status error');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}
