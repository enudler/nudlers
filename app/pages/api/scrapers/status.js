import { getDB } from '../db';
import logger from '../../../utils/logger.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await getDB();

  const minimal = req.query.minimal === 'true';

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

    // Get the most recent scrape event
    const latestScrapeResult = await client.query(`
      SELECT 
        id,
        triggered_by,
        vendor,
        start_date,
        status,
        message,
        CASE 
          WHEN created_at IS NOT NULL 
          THEN to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          ELSE NULL
        END as created_at,
        duration_seconds
      FROM scrape_events
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const latestScrape = latestScrapeResult.rows[0] || null;

    // Get last synced time for each active account
    const lastSyncedResult = await client.query(`
      SELECT 
        id,
        nickname,
        vendor,
        CASE 
          WHEN last_synced_at IS NOT NULL 
          THEN to_char(last_synced_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          ELSE NULL
        END as last_synced_at
      FROM vendor_credentials
      WHERE is_active = true
      ORDER BY last_synced_at DESC NULLS LAST
    `);
    const accountSyncStatus = lastSyncedResult.rows;

    // Calculate overall sync health
    const now = new Date();
    const intervalHours = 24; // Implicit daily interval
    let syncHealth = 'unknown';

    if (latestScrape && latestScrape.created_at) {
      const lastSyncTime = new Date(latestScrape.created_at);
      const hoursSinceSync = (now.getTime() - lastSyncTime.getTime()) / (1000 * 60 * 60);

      if (latestScrape.status === 'completed' || latestScrape.status === 'success') {
        if (hoursSinceSync < intervalHours) {
          syncHealth = 'healthy';
        } else if (hoursSinceSync < intervalHours * 2) {
          syncHealth = 'stale';
        } else {
          syncHealth = 'outdated';
        }
      } else if (latestScrape.status === 'started') {
        if (hoursSinceSync > 0.33) {
          syncHealth = 'error';
          latestScrape.message = 'Sync timed out or process crashed';
        } else {
          syncHealth = 'syncing';
        }
      } else if (latestScrape.status === 'failed' || latestScrape.status === 'error') {
        syncHealth = 'error';
      } else if (latestScrape.status === 'cancelled') {
        syncHealth = 'healthy';
      }
    } else if (activeAccounts === 0) {
      syncHealth = 'no_accounts';
    } else {
      syncHealth = 'never_synced';
    }

    // Prepare response
    const response = {
      syncHealth,
      settings: {
        enabled: settings.sync_enabled === true || settings.sync_enabled === 'true',
        syncHour: parseInt(settings.sync_hour) || 3,
        daysBack: parseInt(settings.sync_days_back) || 30
      },
      activeAccounts,
      latestScrape,
      summary: {
        oldest_sync_at: accountSyncStatus.length > 0 ? accountSyncStatus[accountSyncStatus.length - 1].last_synced_at : null,
        has_never_synced: accountSyncStatus.some(a => !a.last_synced_at)
      }
    };

    if (minimal) {
      return res.status(200).json(response);
    }

    // Detailed info for non-minimal requests
    const historyResult = await client.query(`
      SELECT 
        id,
        triggered_by,
        vendor,
        start_date,
        status,
        message,
        CASE 
          WHEN created_at IS NOT NULL 
          THEN to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          ELSE NULL
        END as created_at,
        duration_seconds
      FROM scrape_events
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.status(200).json({
      ...response,
      history: historyResult.rows,
      accountSyncStatus
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Sync status error');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}
