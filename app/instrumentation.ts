
if (typeof process !== 'undefined') {
  process.env.TZ = 'UTC';
}

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

    // Initialize WhatsApp Client through the transport router. The router
    // reads the `whatsapp_transport` setting and lazy-imports either the
    // legacy whatsapp-web.js client or the Baileys client. Importing the
    // chosen module triggers its auto-restore-from-disk side effect.
    try {
      logger.info('[startup] Initializing WhatsApp transport router');
      await import('./utils/whatsapp-transport.js');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error({ error: err.message }, '[startup] Failed to initialize WhatsApp transport router');
    }



    // Initialize WhatsApp daily summary cron job
    try {
      logger.info('[startup] Initializing WhatsApp daily summary cron job');
      const cron = await import('node-cron');

      // Track if cron job is currently running to prevent overlap
      let whatsappCronRunning = false;

      // Run every hour to check if we should send the daily summary
      cron.default.schedule('0 * * * *', async () => {
        // Prevent overlapping executions
        if (whatsappCronRunning) {
          logger.warn('[whatsapp-cron] Previous execution still running, skipping');
          return;
        }
        whatsappCronRunning = true;

        try {
          const { getDB } = await import('./pages/api/db');
          const client = await getDB();

          try {
            // Daily-summary scheduling settings. The actual messaging-channel
            // settings (whatsapp_enabled / telegram_enabled / recipients) are
            // loaded inside the dispatcher.
            const settingsResult = await client.query(
              `SELECT key, value FROM app_settings
               WHERE key IN ('whatsapp_enabled', 'telegram_enabled', 'whatsapp_hour', 'whatsapp_last_sent_date')`
            );

            const settings: Record<string, unknown> = {};
            for (const row of settingsResult.rows) {
              settings[row.key] = row.value;
            }

            const { evaluateDailyCronGuard } = await import('./utils/cronGuards');
            // Run the cron if EITHER channel is enabled. The dispatcher
            // decides which actually fire — it's fine for one to be off.
            const anyChannelEnabledRaw = (() => {
              const truthy = (v: unknown) => v === true || v === 'true' || v === '"true"';
              return truthy(settings.whatsapp_enabled) || truthy(settings.telegram_enabled);
            })();
            const guard = evaluateDailyCronGuard({
              enabledValue: anyChannelEnabledRaw,
              hourValue: settings.whatsapp_hour,
              lastRunValue: settings.whatsapp_last_sent_date,
              defaultHour: 8,
            });

            if (!guard.shouldRun) {
              logger.info({ ...guard }, '[messaging-cron] Skipping execution');
              return;
            }

            const today = guard.today;

            // Generate summary
            const { generateDailySummary } = await import('./utils/summary.js');
            const summary = await generateDailySummary();

            // Fan out to every enabled provider. One channel failing must
            // never block another — sendNotification is partial-failure
            // tolerant.
            const { sendNotification } = await import('./utils/messaging/index.js');
            const dispatch = await sendNotification({
              body: summary,
              purpose: 'daily_summary',
            });

            // Update last sent date — only if at least one channel actually
            // delivered. Otherwise we want the cron to retry on its next run.
            if (dispatch.succeeded > 0) {
              await client.query(
                `UPDATE app_settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = 'whatsapp_last_sent_date'`,
                [JSON.stringify(today)]
              );
            }

            // Log to audit (scrape_events table)
            const status = dispatch.succeeded > 0 ? 'success' : 'failed';
            const auditMsg = dispatch.attempted === 0
              ? 'No messaging channels enabled'
              : `Daily summary: ${dispatch.succeeded}/${dispatch.attempted} channels succeeded`;
            await client.query(
              `INSERT INTO scrape_events (triggered_by, vendor, start_date, status, message, report_json)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              ['messaging_cron', 'daily_summary', today, status, auditMsg, JSON.stringify({ body: summary, dispatch })]
            );

            logger.info({ dispatch }, '[messaging-cron] Daily summary dispatched');
          } catch (error: unknown) {
            const err = error as Error;
            logger.error({ error: err.message, stack: err.stack }, '[messaging-cron] Error sending daily summary');

            // Log failure to audit
            const errorMsg = (error as Error).message;
            const nowObj = new Date();
            const todayDate = `${nowObj.getFullYear()}-${String(nowObj.getMonth() + 1).padStart(2, '0')}-${String(nowObj.getDate()).padStart(2, '0')}`;
            await client.query(
              `INSERT INTO scrape_events (triggered_by, vendor, start_date, status, message, report_json)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              ['messaging_cron', 'daily_summary', todayDate, 'failed', errorMsg, JSON.stringify({ error: errorMsg })]
            ).catch(() => { }); // Ignore if this fails
          } finally {
            client.release();
          }
        } catch (error: unknown) {
          const err = error as Error;
          logger.error({ error: err.message }, '[messaging-cron] Failed to execute cron job');
        } finally {
          whatsappCronRunning = false;
        }
      });

      logger.info('[startup] Daily summary cron job initialized');
    } catch (error: unknown) {
      const err = error as Error;
      logger.warn({ error: err.message }, '[startup] Daily summary cron job initialization failed');
    }

    // Initialize Background Sync cron job
    try {
      logger.info('[startup] Initializing Background Sync cron job');
      const cron = await import('node-cron');

      // Track if sync cron job is currently running to prevent overlap
      let syncCronRunning = false;

      // Run every hour to check if we should trigger a sync
      // The exact hour is controlled by the 'sync_hour' setting in the database
      cron.default.schedule('0 * * * *', async () => {
        // Prevent overlapping executions (sync can take >1 hour on NAS)
        if (syncCronRunning) {
          logger.warn('[sync-cron] Previous sync still running, skipping this execution');
          return;
        }
        syncCronRunning = true;

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

            const { evaluateDailyCronGuard } = await import('./utils/cronGuards');
            const guard = evaluateDailyCronGuard({
              enabledValue: settings.sync_enabled,
              hourValue: settings.sync_hour,
              lastRunValue: settings.sync_last_run_at,
              defaultHour: 3,
            });

            if (!guard.shouldRun) {
              logger.info({ ...guard }, '[sync-cron] Skipping execution');
              return;
            }

            logger.info({ currentHour: guard.targetHour, today: guard.today }, '[sync-cron] Triggering daily background sync');

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
        } finally {
          syncCronRunning = false;
        }
      });

      logger.info('[startup] Background Sync cron job initialized');
    } catch (error: unknown) {
      const err = error as Error;
      logger.warn({ error: err.message }, '[startup] Background Sync cron job initialization failed');
    }
    // Check if Vault is initialized
    try {
      const { getDB } = await import('./pages/api/db');
      const client = await getDB();
      try {
        const result = await client.query("SELECT value FROM app_settings WHERE key = 'wrapped_master_key'");
        const dbKey = result.rows[0]?.value ?? '';
        // Treat empty string and JSON-encoded empty string as "not initialized",
        // matching the same logic used in initialize.js and status.js.
        let isInitialized = false;
        if (dbKey.length > 0) {
          try {
            const parsed = JSON.parse(dbKey);
            isInitialized = typeof parsed === 'string' && parsed.length > 0;
          } catch {
            isInitialized = true;
          }
        }
        if (isInitialized) {
          const VaultStore = (await import('./pages/api/utils/VaultStore')).default;
          VaultStore.setInitialized(true);
          logger.info('[startup] Vault is initialized');
        } else {
          logger.info('[startup] Vault is NOT initialized (using legacy encryption)');
        }
      } finally {
        client.release();
      }
    } catch (error: unknown) {
      const err = error as Error;
      logger.error({ error: err.message }, '[startup] Failed to check vault initialization status');
    }

    // Fire-and-forget WhatsApp message: "the app just started and the vault is
    // waiting to be unlocked." Lets the user know their server came back up
    // (deploy, NAS reboot, OOM) without having to actively check.
    //
    // Not awaited — the WhatsApp client is still authenticating right now;
    // notifyAppStartedWithLockedVault waits internally for the `ready` event
    // (with a 90s ceiling) before sending. We don't want startup blocked on it.
    try {
      const { notifyAppStartedWithLockedVault } = await import('./utils/whatsappStartupNotify.js');
      notifyAppStartedWithLockedVault().catch((err: Error) => {
        logger.warn({ error: err.message }, '[startup] Restart-with-locked-vault notification failed (non-fatal)');
      });
    } catch (error: unknown) {
      const err = error as Error;
      logger.warn({ error: err.message }, '[startup] Failed to schedule restart-locked notification');
    }

  }
}
