import { getDB } from '../db';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export default async function handler(req, res) {
  const client = await getDB();

  try {
    if (req.method === 'GET') {
      // Get all settings or specific setting by key
      const { key } = req.query;

      if (key) {
        const result = await client.query(
          'SELECT key, value, description FROM app_settings WHERE key = $1',
          [key]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Setting not found' });
        }

        return res.status(200).json({
          key: result.rows[0].key,
          value: result.rows[0].value,
          description: result.rows[0].description
        });
      }

      // Get all settings
      const result = await client.query(
        'SELECT key, value, description FROM app_settings ORDER BY key'
      );

      // Convert to a more usable object format
      const settings = {};
      const descriptions = {};
      for (const row of result.rows) {
        settings[row.key] = row.value;
        descriptions[row.key] = row.description;
      }

      // Add current installed version of israeli-bank-scrapers
      try {
        // Use an absolute path relative to process.cwd() for reliability in Docker/Dev
        const pkgPath = path.join(process.cwd(), 'node_modules', 'israeli-bank-scrapers', 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          settings.current_scrapers_version = pkg.version;
        } else {
          // Fallback if node_modules structure is different
          settings.current_scrapers_version = 'unknown';
        }
      } catch (e) {
        console.warn('Could not read scraper version:', e.message);
        settings.current_scrapers_version = 'unknown';
      }

      return res.status(200).json({ settings, descriptions });
    }

    if (req.method === 'PUT') {
      // Update one or more settings
      const { settings } = req.body;

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Settings object is required' });
      }

      const updates = [];
      for (const [key, value] of Object.entries(settings)) {
        // Validate key format (allow underscores and digits)
        if (!/^[a-z0-9_]+$/.test(key)) {
          return res.status(400).json({ error: `Invalid setting key: ${key}` });
        }

        const result = await client.query(
          `UPDATE app_settings 
           SET value = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE key = $2 
           RETURNING key, value`,
          [JSON.stringify(value), key]
        );

        if (result.rows.length > 0) {
          updates.push({ key, value });
        } else {
          // Insert if doesn't exist
          await client.query(
            `INSERT INTO app_settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
            [key, JSON.stringify(value)]
          );
          updates.push({ key, value });
        }
      }

      return res.status(200).json({
        message: 'Settings updated successfully',
        updated: updates
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Settings API error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}
