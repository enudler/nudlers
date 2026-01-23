import { getDB } from './app/pages/api/db.js';
import fs from 'fs';
import path from 'path';

async function runMigration() {
    const client = await getDB();
    try {
        const migrationPath = path.resolve('app/migrations/007_add_phone_number_to_credentials.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log('Running migration...');
        await client.query(sql);
        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        client.release();
        process.exit();
    }
}

runMigration();
