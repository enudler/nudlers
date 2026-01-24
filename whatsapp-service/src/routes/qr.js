const express = require('express');
const router = express.Router();
const whatsapp = require('../whatsapp');

/**
 * GET /qr
 * Get current QR code for authentication
 */
router.get('/', async (req, res) => {
    try {
        const qrData = whatsapp.getCurrentQR();

        if (!qrData) {
            const status = await whatsapp.getStatus();
            if (status.connected) {
                return res.status(400).json({
                    error: 'Already connected',
                    message: 'WhatsApp is already connected'
                });
            } else {
                return res.status(404).json({
                    error: 'QR code not available',
                    message: 'QR code not generated yet. Please wait a moment and try again.'
                });
            }
        }

        res.json(qrData);
    } catch (error) {
        console.error('Error getting QR code:', error);
        res.status(500).json({
            error: 'Failed to get QR code',
            message: error.message
        });
    }
});

/**
 * GET /qr/stream
 * Server-Sent Events for real-time QR code updates
 */
router.get('/stream', async (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial status
    const status = await whatsapp.getStatus();

    if (status.connected) {
        res.write(`data: ${JSON.stringify({ type: 'connected', status })}\n\n`);
        return res.end();
    }

    // Send initial QR if available
    const qrData = whatsapp.getCurrentQR();
    if (qrData) {
        res.write(`data: ${JSON.stringify({ type: 'qr', ...qrData })}\n\n`);
    }

    // Register callback for QR updates
    const qrCallback = (qrCode, expiresAt) => {
        res.write(`data: ${JSON.stringify({ type: 'qr', qr_code: qrCode, expires_at: expiresAt })}\n\n`);
    };

    const statusCallback = async () => {
        const newStatus = await whatsapp.getStatus();
        if (newStatus.connected) {
            res.write(`data: ${JSON.stringify({ type: 'connected', status: newStatus })}\n\n`);
            res.end();
        }
    };

    whatsapp.onQRUpdate(qrCallback);
    whatsapp.onStatusUpdate(statusCallback);

    // Clean up on client disconnect
    req.on('close', () => {
        console.log('SSE client disconnected');
        res.end();
    });
});

module.exports = router;
