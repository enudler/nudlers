import { getDB } from '../db.js';
import { reloadTransport, getActiveTransport } from '../../../utils/whatsapp-transport.js';
import logger from '../../../utils/logger.js';

const ALLOWED = new Set(['web', 'baileys']);

/**
 * POST /api/whatsapp/transport  { transport: 'web' | 'baileys' }
 *
 * Persists the transport choice and forces the router to reload. Each
 * transport has its own auth dir, so flipping requires a fresh QR scan —
 * we surface that in the response so the UI can show a clear prompt.
 *
 * GET returns the current transport.
 */
export default async function handler(req, res) {
    if (req.method === 'GET') {
        return res.status(200).json({ transport: getActiveTransport() ?? 'web' });
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const requested = (req.body && req.body.transport) || '';
    if (!ALLOWED.has(requested)) {
        return res.status(400).json({ error: `transport must be one of: ${[...ALLOWED].join(', ')}` });
    }

    const client = await getDB();
    try {
        await client.query(
            `INSERT INTO app_settings (key, value, description)
             VALUES ('whatsapp_transport', $1::jsonb, 'WhatsApp transport implementation')
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
            [JSON.stringify(requested)]
        );
    } catch (err) {
        logger.error({ err: err.message }, '[transport-api] Failed to persist transport setting');
        return res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        try { client.release(); } catch { /* ignore */ }
    }

    try {
        await reloadTransport();
    } catch (err) {
        logger.error({ err: err.message }, '[transport-api] reloadTransport failed');
        // The setting persisted; client just isn't running yet. Surface
        // the error so the user can manually re-trigger via "Generate QR".
        return res.status(200).json({
            transport: requested,
            warning: `Transport saved but reload failed: ${err.message}`,
        });
    }

    return res.status(200).json({
        transport: requested,
        // Active transport may differ briefly during the reload race; the
        // client will see the right value on next status poll.
        active: getActiveTransport(),
    });
}
