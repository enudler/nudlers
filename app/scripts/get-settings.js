import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Pool } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.NUDLERS_DB_USER,
    host: process.env.NUDLERS_DB_HOST,
    database: process.env.NUDLERS_DB_NAME,
    password: process.env.NUDLERS_DB_PASSWORD,
    port: process.env.NUDLERS_DB_PORT ? parseInt(process.env.NUDLERS_DB_PORT) : 5432,
    ssl: false,
});

async function getSettings() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM app_settings');
        console.log(JSON.stringify(res.rows, null, 2));
    } finally {
        client.release();
        await pool.end();
    }
}

getSettings().catch(console.error);
