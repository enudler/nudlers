/**
 * POST /api/whatsapp-webjs/send
 * Send a WhatsApp message
 *
 * Request body:
 * {
 *   "to": "+972501234567" or "120363XXXXXX@g.us",
 *   "message": "Hello, world!"
 * }
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { to, message } = req.body;

        // Validate input
        if (!to || !message) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Both "to" and "message" fields are required'
            });
        }

        const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';
        const response = await fetch(`${whatsappServiceUrl}/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ to, message })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            error: 'Failed to send message',
            message: error.message
        });
    }
}
