import { getDB } from '../db';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const client = await getDB();

    try {
        const result = await client.query(`
      SELECT 
        id, 
        triggered_by, 
        vendor, 
        start_date, 
        status, 
        message, 
        created_at,
        report_json
      FROM scrape_events 
      ORDER BY created_at DESC 
      LIMIT 20
    `);

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching scrape events:', error);
        res.status(500).json({ message: 'Error fetching scrape events' });
    } finally {
        client.release();
    }
}
