/**
 * GET /api/whatsapp-webjs/contacts
 * Get WhatsApp contacts and groups
 *
 * Query parameters:
 * - type: 'all' | 'contacts' | 'groups' (default: 'all')
 * - refresh: 'true' | 'false' (default: 'false')
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { type = 'all', refresh = 'false' } = req.query;

        const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';
        const url = new URL(`${whatsappServiceUrl}/contacts`);
        url.searchParams.append('type', type);
        url.searchParams.append('refresh', refresh);

        const response = await fetch(url.toString());

        if (!response.ok) {
            const errorData = await response.json();
            return res.status(response.status).json(errorData);
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({
            error: 'Failed to get contacts',
            message: error.message
        });
    }
}
