/**
 * POST /api/whatsapp-webjs/disconnect
 * Disconnect and clear WhatsApp session
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';
        const response = await fetch(`${whatsappServiceUrl}/disconnect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Error disconnecting:', error);
        res.status(500).json({
            error: 'Failed to disconnect',
            message: error.message
        });
    }
}
