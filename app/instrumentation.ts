
export async function register() {
  // Only run migrations on server startup (not during build or in edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[startup] Running database migrations...');

    try {
      // Dynamic import to avoid importing pg during build
      const { runMigrations } = await import('./pages/api/migrate');
      const result = await runMigrations();

      if (result.success) {
        console.log('[startup] Database migrations completed successfully');
      } else {
        console.error('[startup] Database migrations failed:', result.error);
        // Don't exit - let the app start anyway, migrations can be run manually
      }
    } catch (error) {
      console.error('[startup] Failed to run migrations:', error);
    }

    // New: Handle dynamic library updates for israeli-bank-scrapers
    try {
      console.log('[startup] Checking for scraper library version enforcement...');
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
        console.log(`[startup] Ensuring scraper library version: ${targetVersion}...`);
        try {
          const fs = await import('fs');
          const path = await import('path');
          const pkgPath = path.join(process.cwd(), 'node_modules', 'israeli-bank-scrapers', 'package.json');

          if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkg.version !== targetVersion && targetVersion !== 'latest') {
              console.log(`[startup] Version mismatch (installed: ${pkg.version}, target: ${targetVersion}). Installing...`);
              execSync(`npm install israeli-bank-scrapers@${targetVersion} --no-save`, { stdio: 'inherit' });
            } else {
              console.log(`[startup] Library version ${pkg.version} is already satisfied.`);
            }
          } else {
            console.log(`[startup] Library not found. Installing ${targetVersion}...`);
            execSync(`npm install israeli-bank-scrapers@${targetVersion} --no-save`, { stdio: 'inherit' });
          }
        } catch (e) {
          console.error(`[startup] Error checking library version:`, e);
          execSync(`npm install israeli-bank-scrapers@${targetVersion} --no-save`, { stdio: 'inherit' });
        }
      }
    } catch (error: any) {
      console.warn('[startup] Scraper version enforcement skipped (DB might not be ready or error):', error.message);
    }
  }
}
