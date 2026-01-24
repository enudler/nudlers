const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const db = require('./db');

// Global state
let client = null;
let currentQR = null;
let qrExpiry = null;
let isReady = false;
let qrCallbacks = [];
let statusCallbacks = [];

/**
 * Initialize WhatsApp client
 */
async function initializeClient() {
    if (client) {
        console.log('⚠️  WhatsApp client already initialized');
        return client;
    }

    console.log('🚀 Initializing WhatsApp client...');

    client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'nudlers-whatsapp',
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--mute-audio',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--no-default-browser-check',
                '--no-pings',
                '--password-store=basic',
                '--use-mock-keychain',
                '--disable-blink-features=AutomationControlled'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        }
    });

    // Event: QR Code received
    client.on('qr', async (qr) => {
        console.log('📱 QR Code received');
        try {
            currentQR = await QRCode.toDataURL(qr);
            qrExpiry = new Date(Date.now() + 60000); // 1 minute expiry

            // Notify all QR callbacks
            qrCallbacks.forEach(callback => {
                try {
                    callback(currentQR, qrExpiry);
                } catch (error) {
                    console.error('Error in QR callback:', error);
                }
            });
        } catch (error) {
            console.error('❌ Error generating QR code:', error);
        }
    });

    // Event: Authentication successful
    client.on('authenticated', () => {
        console.log('✅ WhatsApp authenticated');
        currentQR = null;
        qrExpiry = null;
    });

    // Event: Authentication failed
    client.on('auth_failure', async (msg) => {
        console.error('❌ WhatsApp authentication failed:', msg);
        await updateSessionStatus(false, null);
        notifyStatusChange();
    });

    // Event: Client is ready
    client.on('ready', async () => {
        console.log('✅ WhatsApp client is ready!');
        isReady = true;
        currentQR = null;
        qrExpiry = null;

        try {
            const info = client.info;
            console.log('📞 Connected as:', info.wid.user);

            await updateSessionStatus(true, info.wid.user);
            notifyStatusChange();
        } catch (error) {
            console.error('❌ Error updating session status:', error);
        }
    });

    // Event: Client disconnected
    client.on('disconnected', async (reason) => {
        console.log('⚠️  WhatsApp disconnected:', reason);
        isReady = false;
        await updateSessionStatus(false, null);
        notifyStatusChange();
    });

    // Event: Loading screen
    client.on('loading_screen', (percent, message) => {
        console.log('⏳ Loading WhatsApp...', percent, message);
    });

    // Event: Message received (for future use)
    client.on('message', async (message) => {
        // Can be used for webhook functionality in the future
        console.log('📨 Message received from:', message.from);
    });

    // Initialize the client
    try {
        await client.initialize();
        console.log('✅ WhatsApp client initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing WhatsApp client:', error);
        throw error;
    }

    return client;
}

/**
 * Update session status in database
 */
async function updateSessionStatus(connected, phoneNumber = null) {
    try {
        const timestamp = new Date().toISOString();

        if (connected) {
            await db.query(
                `INSERT INTO whatsapp_sessions (session_id, phone_number, connected, last_connected_at, updated_at)
                 VALUES ($1, $2, $3, $4, $4)
                 ON CONFLICT (session_id)
                 DO UPDATE SET
                    phone_number = $2,
                    connected = $3,
                    last_connected_at = $4,
                    updated_at = $4`,
                ['default', phoneNumber, true, timestamp]
            );
        } else {
            await db.query(
                `UPDATE whatsapp_sessions
                 SET connected = $1, last_disconnected_at = $2, updated_at = $2
                 WHERE session_id = $3`,
                [false, timestamp, 'default']
            );
        }
    } catch (error) {
        console.error('❌ Error updating session status:', error);
    }
}

/**
 * Get current WhatsApp status
 */
async function getStatus() {
    try {
        const result = await db.query(
            'SELECT * FROM whatsapp_sessions WHERE session_id = $1',
            ['default']
        );

        const session = result.rows[0] || null;

        return {
            connected: isReady,
            session_exists: session !== null,
            phone_number: session?.phone_number || null,
            last_connected: session?.last_connected_at || null,
            last_disconnected: session?.last_disconnected_at || null,
            qr_required: !isReady && currentQR !== null
        };
    } catch (error) {
        console.error('❌ Error getting status:', error);
        return {
            connected: false,
            session_exists: false,
            phone_number: null,
            last_connected: null,
            last_disconnected: null,
            qr_required: false,
            error: error.message
        };
    }
}

/**
 * Get current QR code
 */
function getCurrentQR() {
    if (!currentQR || (qrExpiry && new Date() > qrExpiry)) {
        return null;
    }
    return {
        qr_code: currentQR,
        expires_at: qrExpiry
    };
}

/**
 * Send a WhatsApp message
 */
async function sendMessage(to, message) {
    if (!isReady) {
        throw new Error('WhatsApp client is not ready');
    }

    try {
        // Format number: +972501234567 -> 972501234567@c.us
        // Or keep group ID as-is: 120363XXXXXX@g.us
        let chatId = to;
        if (!to.includes('@')) {
            chatId = `${to.replace(/[^0-9]/g, '')}@c.us`;
        }

        console.log('📤 Sending message to:', chatId);
        const result = await client.sendMessage(chatId, message);

        console.log('✅ Message sent successfully:', result.id.id);
        return {
            success: true,
            message_id: result.id.id,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('❌ Error sending message:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get contacts and groups
 */
async function getContacts() {
    if (!isReady) {
        throw new Error('WhatsApp client is not ready');
    }

    try {
        console.log('📇 Fetching contacts...');
        const contacts = await client.getContacts();
        const chats = await client.getChats();

        const contactList = [];
        const groupList = [];

        // Process contacts
        for (const contact of contacts) {
            if (contact.isUser && !contact.isMe) {
                contactList.push({
                    id: contact.id._serialized,
                    name: contact.name || contact.pushname || contact.number,
                    phone_number: contact.number,
                    is_group: false
                });
            }
        }

        // Process groups
        for (const chat of chats) {
            if (chat.isGroup) {
                groupList.push({
                    id: chat.id._serialized,
                    name: chat.name,
                    is_group: true,
                    participant_count: chat.participants ? chat.participants.length : 0
                });
            }
        }

        // Update database
        await updateContactsInDB(contactList, groupList);

        console.log(`✅ Fetched ${contactList.length} contacts and ${groupList.length} groups`);
        return {
            contacts: contactList,
            groups: groupList
        };
    } catch (error) {
        console.error('❌ Error fetching contacts:', error);
        throw error;
    }
}

/**
 * Update contacts in database
 */
async function updateContactsInDB(contacts, groups) {
    try {
        const allContacts = [...contacts, ...groups];

        for (const contact of allContacts) {
            await db.query(
                `INSERT INTO whatsapp_contacts (contact_id, name, phone_number, is_group, participant_count, last_synced_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT (contact_id)
                 DO UPDATE SET
                    name = $2,
                    phone_number = $3,
                    is_group = $4,
                    participant_count = $5,
                    last_synced_at = NOW()`,
                [
                    contact.id,
                    contact.name,
                    contact.phone_number || null,
                    contact.is_group,
                    contact.participant_count || null
                ]
            );
        }
    } catch (error) {
        console.error('❌ Error updating contacts in DB:', error);
    }
}

/**
 * Disconnect WhatsApp client
 */
async function disconnect() {
    if (!client) {
        return { success: true, message: 'Client not initialized' };
    }

    try {
        await client.logout();
        await client.destroy();
        client = null;
        isReady = false;
        currentQR = null;
        qrExpiry = null;

        await updateSessionStatus(false, null);
        notifyStatusChange();

        console.log('✅ WhatsApp client disconnected');
        return { success: true, message: 'WhatsApp session disconnected' };
    } catch (error) {
        console.error('❌ Error disconnecting:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Register callback for QR code updates
 */
function onQRUpdate(callback) {
    qrCallbacks.push(callback);
}

/**
 * Register callback for status updates
 */
function onStatusUpdate(callback) {
    statusCallbacks.push(callback);
}

/**
 * Notify all status callbacks
 */
function notifyStatusChange() {
    statusCallbacks.forEach(callback => {
        try {
            callback();
        } catch (error) {
            console.error('Error in status callback:', error);
        }
    });
}

/**
 * Graceful shutdown
 */
async function shutdown() {
    console.log('🛑 Shutting down WhatsApp client...');
    if (client) {
        try {
            await client.destroy();
        } catch (error) {
            console.error('Error during shutdown:', error);
        }
    }
}

module.exports = {
    initializeClient,
    getStatus,
    getCurrentQR,
    sendMessage,
    getContacts,
    disconnect,
    onQRUpdate,
    onStatusUpdate,
    shutdown
};
