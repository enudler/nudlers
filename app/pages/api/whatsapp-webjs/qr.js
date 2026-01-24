/**
 * GET /api/whatsapp-webjs/qr
 * Get QR code for WhatsApp authentication
 *
 * Query parameters:
 * - stream: 'true' for SSE stream (default: 'false')
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { stream } = req.query;
    const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';

    try {
        // If stream is requested, proxy the SSE stream
        if (stream === 'true') {
            const response = await fetch(`${whatsappServiceUrl}/qr/stream`);

            if (!response.ok) {
                throw new Error(`WhatsApp service returned ${response.status}`);
            }

            // Set SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // Pipe the stream
            response.body.pipeTo(new WritableStream({
                write(chunk) {
                    res.write(chunk);
                }
            }));

            // Handle client disconnect
            req.on('close', () => {
                res.end();
            });

            return;
        }

        // Otherwise, just fetch the QR code
        const response = await fetch(`${whatsappServiceUrl}/qr`);

        if (!response.ok) {
            const errorData = await response.json();
            return res.status(response.status).json(errorData);
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching QR code:', error);
        res.status(500).json({
            error: 'Failed to get QR code',
            message: error.message
        });
    }
}
