import { getDB } from '../pages/api/db.js';

async function check() {
    const client = await getDB();
    try {
        const res = await client.query("SELECT identifier, vendor, date, name, price, installments_number, installments_total FROM transactions WHERE name LIKE '%חלילית%' ORDER BY date DESC LIMIT 10");
        console.log(JSON.stringify(res.rows, null, 2));
    } finally {
        client.release();
        process.exit();
    }
}

check();
