
export async function register() {
  // Only run migrations on server startup (not during build or in edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const logger = (await import('./utils/logger.js')).default;
    // Intercept Next.js request logs and redirect through our JSON logger
    const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[[()#;?]*([0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

    const handleLog = (chunk: unknown, originalWrite: Function) => {
      const rawMessage = chunk?.toString() || '';

      // If no request log is present, just write it as is
      if (!rawMessage.includes('GET ') && !rawMessage.includes('POST ') &&
        !rawMessage.includes('PUT ') && !rawMessage.includes('DELETE ') &&
        !rawMessage.includes('PATCH ')) {
        return originalWrite(chunk);
      }

      const lines = rawMessage.split('\n');
      let allMatched = true;
      const remainingLines: string[] = [];

      for (const line of lines) {
        if (!line.trim()) {
          remainingLines.push(line);
          continue;
        }

        const cleanLine = stripAnsi(line);
        // Regexp updated to be more flexible with query params and Next.js log format
        const requestLogMatch = cleanLine.match(/^\s*(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+(\S+)\s+(\d+)\s+in\s+(\d+)ms/);

        if (requestLogMatch) {
          const [, method, path, statusCode, duration] = requestLogMatch;
          // Capture additional info like compile/render time if present
          const extraMatch = cleanLine.match(/\((?:compile:\s*(\d+)µs)?(?:,\s*)?(?:render:\s*(\d+)ms)?\)/);

          logger.info({
            method,
            path,
            statusCode: parseInt(statusCode, 10),
            duration: parseInt(duration, 10),
            compileTime: extraMatch?.[1] ? parseInt(extraMatch[1], 10) : undefined,
            renderTime: extraMatch?.[2] ? parseInt(extraMatch[2], 10) : undefined,
            type: 'http_request'
          }, `HTTP ${method} ${path}`);
        } else {
          allMatched = false;
          remainingLines.push(line);
        }
      }

      if (allMatched && lines.length > 0) {
        return true;
      }

      if (remainingLines.length > 0) {
        return originalWrite(remainingLines.join('\n'));
      }

      return true;
    };

    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => handleLog(chunk, originalStdoutWrite) as boolean;

    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: unknown) => handleLog(chunk, originalStderrWrite) as boolean;

    logger.info('[startup] Running database migrations');

    try {
      // Dynamic import to avoid importing pg during build
      const { runMigrations } = await import('./pages/api/migrate');
      const result = await runMigrations();

      if (result.success) {
        logger.info('[startup] Database migrations completed successfully');
      } else {
        logger.error({ error: result.error }, '[startup] Database migrations failed');
        // Don't exit - let the app start anyway, migrations can be run manually
      }
    } catch (error: unknown) {
      const err = error as Error;
      logger.error({ error: err.message, stack: err.stack }, '[startup] Failed to run migrations');
    }

    // Initialize WhatsApp Client (Singleton) - only if WhatsApp is enabled
    // This saves significant memory (~150-200MB) for users who don't use WhatsApp
    try {
      const { getDB } = await import('./pages/api/db');
      const dbClient = await getDB();
      try {
        const result = await dbClient.query(
          "SELECT value FROM app_settings WHERE key = 'whatsapp_enabled'"
        );
        const isWhatsAppEnabled = result.rows.length > 0 &&
          (result.rows[0].value === true || result.rows[0].value === 'true');

        if (isWhatsAppEnabled) {
          logger.info('[startup] WhatsApp is enabled, initializing client...');
          const { getClient } = await import('./utils/whatsapp-client.js');
          getClient(); // Triggers initialization
        } else {
          logger.info('[startup] WhatsApp is disabled, skipping client initialization (saves ~150MB RAM)');
        }
      } finally {
        dbClient.release();
      }
    } catch (error: unknown) {
      const err = error as Error;
      // If we can't check settings, skip WhatsApp to save resources
      logger.warn({ error: err.message }, '[startup] Could not check WhatsApp settings, skipping initialization');
    }



    // Initialize WhatsApp daily summary cron job
    try {
      logger.info('[startup] Initializing WhatsApp daily summary cron job');
      const cron = await import('node-cron');

      // Run every hour to check if we should send the daily summary
      cron.default.schedule('0 * * * *', async () => {
        try {
          const { getDB } = await import('./pages/api/db');
          const client = await getDB();

          try {
            // Get WhatsApp settings
            const settingsResult = await client.query(
              `SELECT key, value FROM app_settings 
               WHERE key IN ('whatsapp_enabled', 'whatsapp_hour', 'whatsapp_last_sent_date', 'whatsapp_to')`
            );

            const settings: Record<string, unknown> = {};
            for (const row of settingsResult.rows) {
              settings[row.key] = row.value;
            }

            // Check if enabled
            if (settings.whatsapp_enabled !== true && settings.whatsapp_enabled !== 'true') {
              return;
            }

            // Check if we're at the right hour
            const now = new Date();
            const currentHour = now.getHours();
            const targetHour = parseInt((settings.whatsapp_hour as string) || '8', 10);

            if (currentHour !== targetHour) {
              return;
            }

            // Check if we already sent today
            const today = now.toISOString().split('T')[0];
            const lastSentDate = typeof settings.whatsapp_last_sent_date === 'string'
              ? settings.whatsapp_last_sent_date.replace(/"/g, '')
              : '';

            if (lastSentDate === today) {
              return;
            }

            logger.info('[whatsapp-cron] Sending daily summary');

            // Generate summary
            const { generateDailySummary } = await import('./utils/summary.js');
            const summary = await generateDailySummary();

            // Send WhatsApp message
            const { sendWhatsAppMessage } = await import('./utils/whatsapp.js');
            const to = typeof settings.whatsapp_to === 'string'
              ? settings.whatsapp_to.replace(/"/g, '')
              : settings.whatsapp_to as string;

            await sendWhatsAppMessage({
              to,
              body: summary
            });

            // Update last sent date
            await client.query(
              `UPDATE app_settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = 'whatsapp_last_sent_date'`,
              [JSON.stringify(today)]
            );

            // Log to audit (scrape_events table)
            await client.query(
              `INSERT INTO scrape_events (triggered_by, vendor, start_date, status, message, report_json)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              ['whatsapp_cron', 'whatsapp_summary', today, 'success', `WhatsApp summary sent to ${to}`, JSON.stringify({ body: summary, to })]
            );

            logger.info('[whatsapp-cron] Daily summary sent successfully');
          } catch (error: unknown) {
            const err = error as Error;
            logger.error({ error: err.message, stack: err.stack }, '[whatsapp-cron] Error sending daily summary');

            // Log failure to audit
            const errorMsg = (error as Error).message;
            const todayDate = new Date().toISOString().split('T')[0];
            await client.query(
              `INSERT INTO scrape_events (triggered_by, vendor, start_date, status, message, report_json)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              ['whatsapp_cron', 'whatsapp_summary', todayDate, 'failed', errorMsg, JSON.stringify({ error: errorMsg })]
            ).catch(() => { }); // Ignore if this fails
          } finally {
            client.release();
          }
        } catch (error: unknown) {
          const err = error as Error;
          logger.error({ error: err.message }, '[whatsapp-cron] Failed to execute cron job');
        }
      });

      logger.info('[startup] WhatsApp cron job initialized');
    } catch (error: unknown) {
      const err = error as Error;
      logger.warn({ error: err.message }, '[startup] WhatsApp cron job initialization failed');
    }

    // Initialize Background Sync cron job
    try {
      logger.info('[startup] Initializing Background Sync cron job');
      const cron = await import('node-cron');

      // Run every hour to check if we should trigger a sync
      // The exact hour is controlled by the 'sync_hour' setting in the database
      cron.default.schedule('0 * * * *', async () => {
        // If we run exactly at 00 minutes, we might be a few ms early or late.
        // The currentHour check below handles the logic correctly.
        try {
          const { getDB } = await import('./pages/api/db');
          const client = await getDB();

          try {
            const settingsResult = await client.query(
              `SELECT key, value FROM app_settings 
               WHERE key IN ('sync_enabled', 'sync_hour', 'sync_last_run_at')`
            );

            const settings: Record<string, unknown> = {};
            for (const row of settingsResult.rows) {
              settings[row.key] = row.value;
            }

            // Check if enabled
            if (settings.sync_enabled !== true && settings.sync_enabled !== 'true') {
              return;
            }

            // Check if we're at the right hour
            const now = new Date();
            const currentHour = now.getHours();
            const targetHour = parseInt((settings.sync_hour as string) || '3', 10);

            if (currentHour !== targetHour) {
              return;
            }

            // Check if we already ran today
            const today = now.toISOString().split('T')[0];
            const lastRunStr = typeof settings.sync_last_run_at === 'string'
              ? settings.sync_last_run_at.replace(/"/g, '')
              : '';
            const lastRunDate = lastRunStr.split('T')[0];

            if (lastRunDate === today) {
              return;
            }

            logger.info({ currentHour, today }, '[sync-cron] Triggering daily background sync');

            // Import and run the background sync
            const { runBackgroundSync } = await import('./scripts/background-sync.js');
            await runBackgroundSync();

            // Update last run time
            const nowIso = new Date().toISOString();
            await client.query(
              `UPDATE app_settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = 'sync_last_run_at'`,
              [JSON.stringify(nowIso)]
            );

            logger.info('[sync-cron] Background sync completed and last run time updated');
          } catch (error: unknown) {
            const err = error as Error;
            logger.error({ error: err.message, stack: err.stack }, '[sync-cron] Error during background sync');
          } finally {
            client.release();
          }
        } catch (error: unknown) {
          const err = error as Error;
          logger.error({ error: err.message }, '[sync-cron] Failed to execute sync cron job');
        }
      });

      logger.info('[startup] Background Sync cron job initialized');
    } catch (error: unknown) {
      const err = error as Error;
      logger.warn({ error: err.message }, '[startup] Background Sync cron job initialization failed');
    }
  }
}
