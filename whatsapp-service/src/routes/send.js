const express = require('express');
const router = express.Router();
const whatsapp = require('../whatsapp');

/**
 * POST /send
 * Send a WhatsApp message
 */
router.post('/', async (req, res) => {
    try {
        const { to, message } = req.body;

        // Validate input
        if (!to || !message) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Both "to" and "message" fields are required'
            });
        }

        // Check if client is ready
        const status = await whatsapp.getStatus();
        if (!status.connected) {
            return res.status(503).json({
                error: 'WhatsApp not connected',
                message: 'Please connect WhatsApp first by scanning the QR code'
            });
        }

        // Send message
        const result = await whatsapp.sendMessage(to, message);

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            error: 'Failed to send message',
            message: error.message
        });
    }
});

module.exports = router;
