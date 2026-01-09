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
      // Don't exit - database might not be ready yet on first startup
      // The app can still start and migrations can be run via /api/migrate
    }
  }
}
