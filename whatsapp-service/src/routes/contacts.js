const express = require('express');
const router = express.Router();
const whatsapp = require('../whatsapp');
const db = require('../db');

/**
 * GET /contacts
 * Get contacts and groups
 */
router.get('/', async (req, res) => {
    try {
        const { type = 'all', refresh = 'false' } = req.query;

        // Check if client is ready
        const status = await whatsapp.getStatus();
        if (!status.connected) {
            return res.status(503).json({
                error: 'WhatsApp not connected',
                message: 'Please connect WhatsApp first by scanning the QR code'
            });
        }

        // If refresh requested, fetch from WhatsApp
        if (refresh === 'true') {
            const result = await whatsapp.getContacts();
            return res.json(result);
        }

        // Otherwise, fetch from database
        let query = 'SELECT * FROM whatsapp_contacts ORDER BY name ASC';
        const params = [];

        if (type === 'contacts') {
            query = 'SELECT * FROM whatsapp_contacts WHERE is_group = false ORDER BY name ASC';
        } else if (type === 'groups') {
            query = 'SELECT * FROM whatsapp_contacts WHERE is_group = true ORDER BY name ASC';
        }

        const result = await db.query(query, params);

        const contacts = result.rows.filter(r => !r.is_group);
        const groups = result.rows.filter(r => r.is_group);

        res.json({
            contacts: contacts.map(c => ({
                id: c.contact_id,
                name: c.name,
                phone_number: c.phone_number,
                is_group: false
            })),
            groups: groups.map(g => ({
                id: g.contact_id,
                name: g.name,
                is_group: true,
                participant_count: g.participant_count
            }))
        });
    } catch (error) {
        console.error('Error getting contacts:', error);
        res.status(500).json({
            error: 'Failed to get contacts',
            message: error.message
        });
    }
});

module.exports = router;
