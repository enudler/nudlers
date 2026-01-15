
export async function register() {
  // Only run migrations on server startup (not during build or in edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const logger = (await import('./utils/logger.js')).default;
    // Intercept Next.js request logs and redirect through our JSON logger
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: any, encoding?: any, callback?: any) => {
      const message = chunk?.toString() || '';

      // Check if this is a Next.js request log (format: "GET /api/ping 304 in 17ms (compile: 1469µs, render: 16ms)")
      const requestLogMatch = message.match(/^\s*(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+(\S+)\s+(\d+)\s+in\s+(\d+)ms(?:\s*\(compile:\s*(\d+)µs,\s*render:\s*(\d+)ms\))?/);

      if (requestLogMatch) {
        const [, method, path, statusCode, duration, compileTime, renderTime] = requestLogMatch;
        // Log through our JSON logger instead
        logger.info({
          method,
          path,
          statusCode: parseInt(statusCode, 10),
          duration: parseInt(duration, 10),
          compileTime: compileTime ? parseInt(compileTime, 10) : undefined,
          renderTime: renderTime ? parseInt(renderTime, 10) : undefined,
          type: 'http_request'
        }, 'HTTP request');
        return true; // Suppress the original log
      }

      // Allow other logs through normally
      return originalStdoutWrite(chunk, encoding, callback);
    };

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
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, '[startup] Failed to run migrations');
    }

    // New: Handle dynamic library updates for israeli-bank-scrapers
    try {
      logger.info('[startup] Checking for scraper library version enforcement');
      const { getDB } = await import('./pages/api/db');
      const { execSync } = await import('child_process');
      const client = await getDB();
      const versionResult = await client.query("SELECT value FROM app_settings WHERE key = 'israeli_bank_scrapers_version'");
      client.release();

      let targetVersion = process.env.ISRAELI_BANK_SCRAPERS_VERSION;

      if (versionResult.rows.length > 0) {
        const dbVersion = versionResult.rows[0].value.replace(/"/g, '');
        if (dbVersion && dbVersion !== 'none') {
          targetVersion = dbVersion;
        }
      }

      if (targetVersion && targetVersion !== 'none') {
        logger.info({ version: targetVersion }, '[startup] Ensuring scraper library version');
        try {
          const fs = await import('fs');
          const path = await import('path');
          const cwd = process.cwd() || __dirname || '.';
          const pkgPath = path.join(cwd, 'node_modules', 'israeli-bank-scrapers', 'package.json');

          if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkg.version !== targetVersion && targetVersion !== 'latest') {
              logger.info({ installed: pkg.version, target: targetVersion }, '[startup] Version mismatch, installing');
              execSync(`npm install israeli-bank-scrapers@${targetVersion} --no-save`, { stdio: 'inherit' });
            } else {
              logger.info({ version: pkg.version }, '[startup] Library version already satisfied');
            }
          } else {
            logger.info({ version: targetVersion }, '[startup] Library not found, installing');
            execSync(`npm install israeli-bank-scrapers@${targetVersion} --no-save`, { stdio: 'inherit' });
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          const errorStack = e instanceof Error ? e.stack : undefined;
          logger.error({ error: errorMessage, stack: errorStack }, '[startup] Error checking library version');
          execSync(`npm install israeli-bank-scrapers@${targetVersion} --no-save`, { stdio: 'inherit' });
        }
      }
    } catch (error: any) {
      logger.warn({ error: error.message }, '[startup] Scraper version enforcement skipped (DB might not be ready or error)');
    }

    // Initialize WhatsApp daily summary cron job
    try {
      logger.info('[startup] Initializing WhatsApp daily summary cron job');
      const cron = await import('node-cron');

      // Run every minute to check if we should send the daily summary
      cron.default.schedule('* * * * *', async () => {
        try {
          const { getDB } = await import('./pages/api/db');
          const client = await getDB();

          try {
            // Get WhatsApp settings
            const settingsResult = await client.query(
              `SELECT key, value FROM app_settings 
               WHERE key IN ('whatsapp_enabled', 'whatsapp_hour', 'whatsapp_last_sent_date',
                             'whatsapp_twilio_sid', 'whatsapp_twilio_auth_token', 
                             'whatsapp_twilio_from', 'whatsapp_to')`
            );

            const settings: Record<string, any> = {};
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
            const targetHour = parseInt(settings.whatsapp_hour || '8', 10);

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
            const sid = typeof settings.whatsapp_twilio_sid === 'string'
              ? settings.whatsapp_twilio_sid.replace(/"/g, '')
              : settings.whatsapp_twilio_sid;
            const authToken = typeof settings.whatsapp_twilio_auth_token === 'string'
              ? settings.whatsapp_twilio_auth_token.replace(/"/g, '')
              : settings.whatsapp_twilio_auth_token;
            const from = typeof settings.whatsapp_twilio_from === 'string'
              ? settings.whatsapp_twilio_from.replace(/"/g, '')
              : settings.whatsapp_twilio_from;
            const to = typeof settings.whatsapp_to === 'string'
              ? settings.whatsapp_to.replace(/"/g, '')
              : settings.whatsapp_to;

            await sendWhatsAppMessage({
              sid,
              authToken,
              from,
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
              `INSERT INTO scrape_events (triggered_by, vendor, start_date, status, message)
               VALUES ($1, $2, $3, $4, $5)`,
              ['whatsapp_cron', 'whatsapp_summary', today, 'success', 'Daily WhatsApp summary sent']
            );

            logger.info('[whatsapp-cron] Daily summary sent successfully');
          } catch (error: any) {
            logger.error({ error: error.message, stack: error.stack }, '[whatsapp-cron] Error sending daily summary');

            // Log failure to audit
            const today = new Date().toISOString().split('T')[0];
            await client.query(
              `INSERT INTO scrape_events (triggered_by, vendor, start_date, status, message)
               VALUES ($1, $2, $3, $4, $5)`,
              ['whatsapp_cron', 'whatsapp_summary', today, 'failed', error.message]
            ).catch(() => { }); // Ignore if this fails
          } finally {
            client.release();
          }
        } catch (error: any) {
          logger.error({ error: error.message }, '[whatsapp-cron] Failed to execute cron job');
        }
      });

      logger.info('[startup] WhatsApp cron job initialized');
    } catch (error: any) {
      logger.warn({ error: error.message }, '[startup] WhatsApp cron job initialization failed');
    }
  }
}
