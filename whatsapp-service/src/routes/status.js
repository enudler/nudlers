const express = require('express');
const router = express.Router();
const whatsapp = require('../whatsapp');

/**
 * GET /status
 * Get WhatsApp connection status
 */
router.get('/', async (req, res) => {
    try {
        const status = await whatsapp.getStatus();
        res.json(status);
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({
            error: 'Failed to get WhatsApp status',
            message: error.message
        });
    }
});

module.exports = router;
