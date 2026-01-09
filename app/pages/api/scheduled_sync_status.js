import { getDB } from './db';
import { withAuth } from './middleware/auth';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const client = await getDB();

  try {
    // Get the latest sync run with details
    const latestRunResult = await client.query(`
      SELECT 
        id,
        started_at,
        completed_at,
        status,
        total_accounts,
        successful_accounts,
        failed_accounts,
        total_transactions,
        error_message,
        triggered_by,
        details
      FROM scheduled_sync_runs
      ORDER BY started_at DESC
      LIMIT 1
    `);

    // Get the last 5 sync runs for history (with details for expandable view)
    const historyResult = await client.query(`
      SELECT 
        id,
        started_at,
        completed_at,
        status,
        total_accounts,
        successful_accounts,
        failed_accounts,
        total_transactions,
        triggered_by,
        details
      FROM scheduled_sync_runs
      ORDER BY started_at DESC
      LIMIT 5
    `);

    // Get sync config
    const configResult = await client.query(`
      SELECT is_enabled, schedule_hours, days_to_sync
      FROM scheduled_sync_config
      LIMIT 1
    `);

    // Get count of active accounts
    const accountsResult = await client.query(`
      SELECT COUNT(*) as count FROM vendor_credentials WHERE is_active = true
    `);

    const latestRun = latestRunResult.rows[0] || null;
    const config = configResult.rows[0] || { is_enabled: true, schedule_hours: [6, 18], days_to_sync: 7 };
    const activeAccounts = parseInt(accountsResult.rows[0]?.count || '0');

    // Calculate next scheduled run time
    let nextScheduledRun = null;
    if (config.is_enabled && config.schedule_hours?.length > 0) {
      const now = new Date();
      const currentHour = now.getHours();
      
      // Find the next scheduled hour
      const sortedHours = [...config.schedule_hours].sort((a, b) => a - b);
      let nextHour = sortedHours.find(h => h > currentHour);
      
      if (nextHour !== undefined) {
        // Next run is today
        nextScheduledRun = new Date(now);
        nextScheduledRun.setHours(nextHour, 0, 0, 0);
      } else {
        // Next run is tomorrow at the first scheduled hour
        nextScheduledRun = new Date(now);
        nextScheduledRun.setDate(nextScheduledRun.getDate() + 1);
        nextScheduledRun.setHours(sortedHours[0], 0, 0, 0);
      }
    }

    // Calculate the date range for the next sync
    const nextSyncStartDate = new Date();
    nextSyncStartDate.setDate(nextSyncStartDate.getDate() - (config.days_to_sync || 7));
    nextSyncStartDate.setHours(0, 0, 0, 0);
    const nextSyncEndDate = new Date();

    res.status(200).json({
      latestRun,
      history: historyResult.rows,
      config: {
        isEnabled: config.is_enabled,
        scheduleHours: config.schedule_hours,
        daysToSync: config.days_to_sync
      },
      nextScheduledRun: nextScheduledRun?.toISOString() || null,
      nextSyncDateRange: {
        startDate: nextSyncStartDate.toISOString(),
        endDate: nextSyncEndDate.toISOString()
      },
      activeAccounts
    });

  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      message: 'Failed to get sync status',
      error: error.message
    });
  } finally {
    client.release();
  }
}

export default withAuth(handler);
