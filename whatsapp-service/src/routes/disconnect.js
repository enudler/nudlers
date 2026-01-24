const express = require('express');
const router = express.Router();
const whatsapp = require('../whatsapp');

/**
 * POST /disconnect
 * Disconnect and clear WhatsApp session
 */
router.post('/', async (req, res) => {
    try {
        const result = await whatsapp.disconnect();

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Error disconnecting:', error);
        res.status(500).json({
            error: 'Failed to disconnect',
            message: error.message
        });
    }
});

module.exports = router;
