/**
 * GET /api/whatsapp-webjs/status
 * Get WhatsApp Web.js connection status
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';
        const response = await fetch(`${whatsappServiceUrl}/status`);

        if (!response.ok) {
            throw new Error(`WhatsApp service returned ${response.status}`);
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching WhatsApp status:', error);
        res.status(500).json({
            error: 'Failed to get WhatsApp status',
            message: error.message,
            connected: false,
            session_exists: false
        });
    }
}
