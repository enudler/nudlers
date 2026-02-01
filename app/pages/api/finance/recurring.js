import { getDB } from "../db";
import logger from "../../../utils/logger";

export default async function handler(req, res) {
    const client = await getDB();
    try {
        if (req.method === 'GET') {
            const result = await client.query(`
                SELECT * FROM manual_recurring_payments 
                ORDER BY is_active DESC, name ASC
            `);
            return res.status(200).json(result.rows);
        }

        if (req.method === 'POST') {
            const { name, amount, category, account_number, day_of_month, frequency = 'monthly' } = req.body;

            if (!name || amount === undefined || !day_of_month) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const result = await client.query(`
                INSERT INTO manual_recurring_payments 
                (name, amount, category, account_number, day_of_month, frequency)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [name, amount, category, account_number, day_of_month, frequency]);

            return res.status(201).json(result.rows[0]);
        }

        if (req.method === 'PATCH') {
            const { id, is_active } = req.body;
            if (!id) return res.status(400).json({ error: 'ID required' });

            const result = await client.query(`
                UPDATE manual_recurring_payments 
                SET is_active = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `, [is_active, id]);

            return res.status(200).json(result.rows[0]);
        }

        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'ID required' });

            await client.query('DELETE FROM manual_recurring_payments WHERE id = $1', [id]);
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        logger.error(err, "Error in manual-recurring API");
        return res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
}
