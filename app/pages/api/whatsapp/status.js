
import { getStatus, restartClient, destroyClient, initializeClient } from '../../../utils/whatsapp-client.js';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const status = getStatus();
        return res.status(200).json(status);
    }

    if (req.method === 'POST') {
        const { action } = req.body;

        if (action === 'connect') {
            // Initialize the client on-demand (generates QR code)
            initializeClient();
            return res.status(200).json({ message: 'Connecting... QR code will be generated shortly.' });
        }

        if (action === 'restart') {
            await restartClient();
            return res.status(200).json({ message: 'Restarting client...' });
        }

        if (action === 'disconnect') {
            await destroyClient();
            return res.status(200).json({ message: 'Client disconnected' });
        }

        return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
