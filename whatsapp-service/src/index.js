const express = require('express');
const cors = require('cors');
const whatsapp = require('./whatsapp');
const db = require('./db');

// Import routes
const statusRoute = require('./routes/status');
const qrRoute = require('./routes/qr');
const sendRoute = require('./routes/send');
const disconnectRoute = require('./routes/disconnect');
const contactsRoute = require('./routes/contacts');

// Initialize Express app
const app = express();
const PORT = process.env.WHATSAPP_SERVICE_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Check database connection
        await db.query('SELECT 1');

        // Check WhatsApp status
        const whatsappStatus = await whatsapp.getStatus();

        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            whatsapp: {
                connected: whatsappStatus.connected,
                session_exists: whatsappStatus.session_exists
            },
            database: {
                connected: true
            }
        };

        const statusCode = whatsappStatus.connected ? 200 : 200; // Return 200 even if not connected
        res.status(statusCode).json(health);
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// API routes
app.use('/status', statusRoute);
app.use('/qr', qrRoute);
app.use('/send', sendRoute);
app.use('/disconnect', disconnectRoute);
app.use('/contacts', contactsRoute);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'Nudlers WhatsApp Service',
        version: '1.0.0',
        endpoints: {
            health: 'GET /health',
            status: 'GET /status',
            qr: 'GET /qr',
            qr_stream: 'GET /qr/stream',
            send: 'POST /send',
            disconnect: 'POST /disconnect',
            contacts: 'GET /contacts'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.path} not found`
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Initialize WhatsApp client and start server
async function start() {
    try {
        console.log('🚀 Starting Nudlers WhatsApp Service...');

        // Test database connection
        console.log('📊 Testing database connection...');
        await db.query('SELECT NOW()');
        console.log('✅ Database connection successful');

        // Initialize WhatsApp client
        console.log('📱 Initializing WhatsApp client...');
        await whatsapp.initializeClient();

        // Start Express server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ WhatsApp service listening on port ${PORT}`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('❌ Failed to start service:', error);
        process.exit(1);
    }
}

// Graceful shutdown
async function shutdown(signal) {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

    try {
        // Close WhatsApp client
        await whatsapp.shutdown();

        // Close database connection
        await db.close();

        console.log('✅ Shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
});

// Start the service
start();
