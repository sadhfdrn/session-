const express = require('express');
const cors = require('cors');
const { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@fizzxydev/baileys-pro');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active sessions
const activeSessions = new Map();

// Logger
const logger = pino({ level: 'silent' });

// Ensure sessions directory exists
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

// Generate session folder path
const getSessionPath = (phoneNumber) => {
    return path.join(sessionsDir, `session_${phoneNumber}`);
};

// Create single creds.json from session data
const createCredsJson = (sessionPath) => {
    try {
        const credsPath = path.join(sessionPath, 'creds.json');
        const preKeysPath = path.join(sessionPath, 'pre-key-1.json');
        const senderKeysPath = path.join(sessionPath, 'sender-key-120363025246125888@g.us--1234567890@s.whatsapp.net--0.json');
        
        let credsData = {};
        let preKeysData = {};
        let senderKeysData = {};
        
        // Read creds.json
        if (fs.existsSync(credsPath)) {
            credsData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        }
        
        // Read pre-keys (find the first pre-key file)
        const files = fs.readdirSync(sessionPath);
        const preKeyFile = files.find(file => file.startsWith('pre-key-'));
        if (preKeyFile) {
            const preKeyPath = path.join(sessionPath, preKeyFile);
            preKeysData = JSON.parse(fs.readFileSync(preKeyPath, 'utf8'));
        }
        
        // Read sender keys (find the first sender-key file)
        const senderKeyFile = files.find(file => file.startsWith('sender-key-'));
        if (senderKeyFile) {
            const senderKeyPath = path.join(sessionPath, senderKeyFile);
            senderKeysData = JSON.parse(fs.readFileSync(senderKeyPath, 'utf8'));
        }
        
        // Combine all data into single creds.json
        const combinedCreds = {
            ...credsData,
            preKeys: preKeysData,
            senderKeys: senderKeysData,
            timestamp: new Date().toISOString()
        };
        
        return JSON.stringify(combinedCreds);
    } catch (error) {
        console.error('Error creating creds.json:', error);
        return null;
    }
};

// Send session via WhatsApp message
const sendSessionViaWhatsApp = async (sock, phoneNumber, sessionData) => {
    try {
        const jid = phoneNumber + '@s.whatsapp.net';
        
        // First message: Usage instructions
        const instructionsMessage = `🔐 *WhatsApp Session Generated Successfully*\n\n` +
                                   `📱 *Instructions:*\n` +
                                   `1. Save the next message as "creds.json"\n` +
                                   `2. Use it in your WhatsApp bot project\n` +
                                   `3. Keep it secure and don't share\n\n` +
                                   `⚠️ *Important:* This session is tied to this device. If you logout from WhatsApp, you'll need to generate a new session.\n\n` +
                                   `The creds.json content will be sent in the next message...`;
        
        await sock.sendMessage(jid, { text: instructionsMessage });
        console.log(`Instructions sent via WhatsApp to: ${phoneNumber}`);
        
        // Wait a moment before sending the second message
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Second message: creds.json content in one line
        const credsMessage =`${sessionData}`
        await sock.sendMessage(jid, { text: credsMessage });
        console.log(`Creds.json sent via WhatsApp to: ${phoneNumber}`);
        return true;
    } catch (error) {
        console.error('Error sending session via WhatsApp:', error);
        return false;
    }
};

// Initialize WhatsApp connection
const initializeWhatsApp = async (phoneNumber, io) => {
    try {
        const sessionPath = getSessionPath(phoneNumber);
        
        // Create session directory if it doesn't exist
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version, isLatest } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: false,
            auth: state,
            generateHighQualityLinkPreview: true,
            getMessage: async (key) => {
                return { conversation: 'Hello' };
            },
        });

        // Store session
        activeSessions.set(phoneNumber, {
            sock,
            sessionPath,
            saveCreds,
            connected: false
        });

        // Handle pairing code
        if (!sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    const pairingCode = await sock.requestPairingCode(phoneNumber);
                    console.log('Pairing code generated:', pairingCode, 'for:', phoneNumber);
                    io.emit('pairingCode', { phoneNumber, pairingCode });
                } catch (error) {
                    console.error('Error requesting pairing code:', error);
                    io.emit('error', { phoneNumber, message: 'Failed to generate pairing code' });
                }
            }, 3000);
        }

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr, isNewLogin } = update;
            
            console.log('Connection update:', { connection, phoneNumber });

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed:', lastDisconnect?.error);
                
                if (shouldReconnect) {
                    io.emit('connectionStatus', { phoneNumber, status: 'reconnecting' });
                    // Clean up current session before reconnecting
                    activeSessions.delete(phoneNumber);
                    setTimeout(() => initializeWhatsApp(phoneNumber, io), 5000);
                } else {
                    io.emit('connectionStatus', { phoneNumber, status: 'logged_out' });
                    activeSessions.delete(phoneNumber);
                }
            } else if (connection === 'open') {
                console.log('WhatsApp connected successfully for:', phoneNumber);
                io.emit('connectionStatus', { phoneNumber, status: 'connected' });
                
                const session = activeSessions.get(phoneNumber);
                if (session) {
                    session.connected = true;
                    
                    // Wait a moment for session to stabilize
                    setTimeout(async () => {
                        try {
                            // Create single creds.json
                            const sessionData = createCredsJson(sessionPath);
                            
                            if (sessionData) {
                                // Send session via WhatsApp
                                const sent = await sendSessionViaWhatsApp(sock, phoneNumber, sessionData);
                                
                                if (sent) {
                                    io.emit('sessionReady', { 
                                        phoneNumber, 
                                        message: 'Session sent to your WhatsApp! Check your messages.',
                                        sessionSent: true
                                    });
                                    
                                    // Clean up session after sending - allow reconnection
                                    setTimeout(() => {
                                        try {
                                            if (activeSessions.has(phoneNumber)) {
                                                const session = activeSessions.get(phoneNumber);
                                                if (session.sock) {
                                                    session.sock.end();
                                                }
                                                activeSessions.delete(phoneNumber);
                                            }
                                            // Clean up session directory
                                            if (fs.existsSync(sessionPath)) {
                                                fs.rmSync(sessionPath, { recursive: true, force: true });
                                            }
                                        } catch (cleanupError) {
                                            console.error('Error cleaning up session:', cleanupError);
                                        }
                                    }, 10000); // Clean up after 10 seconds
                                } else {
                                    io.emit('error', { phoneNumber, message: 'Failed to send session via WhatsApp' });
                                }
                            } else {
                                io.emit('error', { phoneNumber, message: 'Error creating session file' });
                            }
                        } catch (error) {
                            console.error('Error processing session:', error);
                            io.emit('error', { phoneNumber, message: 'Error processing session' });
                        }
                    }, 3000);
                }
            } else if (connection === 'connecting') {
                io.emit('connectionStatus', { phoneNumber, status: 'connecting' });
            }
        });

        // Handle credentials update
        sock.ev.on('creds.update', saveCreds);

        return sock;
    } catch (error) {
        console.error('Error initializing WhatsApp:', error);
        io.emit('error', { phoneNumber, message: 'Failed to initialize WhatsApp connection' });
        throw error;
    }
};

// Socket.IO setup
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('generateSession', async (data) => {
        const { phoneNumber } = data;
        
        if (!phoneNumber) {
            socket.emit('error', { message: 'Phone number is required' });
            return;
        }

        // Validate phone number format (basic validation)
        const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
        if (cleanPhoneNumber.length < 10) {
            socket.emit('error', { message: 'Invalid phone number format' });
            return;
        }

        try {
            // Allow multiple connections - clean up existing session if exists
            if (activeSessions.has(cleanPhoneNumber)) {
                const existingSession = activeSessions.get(cleanPhoneNumber);
                try {
                    if (existingSession.sock) {
                        existingSession.sock.end();
                    }
                } catch (error) {
                    console.error(`Error closing existing session for ${cleanPhoneNumber}:`, error);
                }
                activeSessions.delete(cleanPhoneNumber);
            }

            socket.emit('connectionStatus', { phoneNumber: cleanPhoneNumber, status: 'initializing' });
            await initializeWhatsApp(cleanPhoneNumber, io);
        } catch (error) {
            console.error('Error generating session:', error);
            socket.emit('error', { phoneNumber: cleanPhoneNumber, message: 'Failed to generate session' });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// REST API endpoints
app.post('/api/generate-session', async (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    
    try {
        // Allow multiple connections - clean up existing session if exists
        if (activeSessions.has(cleanPhoneNumber)) {
            const existingSession = activeSessions.get(cleanPhoneNumber);
            try {
                if (existingSession.sock) {
                    existingSession.sock.end();
                }
            } catch (error) {
                console.error(`Error closing existing session for ${cleanPhoneNumber}:`, error);
            }
            activeSessions.delete(cleanPhoneNumber);
        }

        await initializeWhatsApp(cleanPhoneNumber, io);
        res.json({ success: true, message: 'Session generation started', phoneNumber: cleanPhoneNumber });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to generate session' });
    }
});

// Download endpoint for session files
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(sessionsDir, filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    res.download(filePath, (err) => {
        if (err) {
            console.error('Download error:', err);
            res.status(500).json({ error: 'Download failed' });
        } else {
            // Delete the file after download
            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (deleteErr) {
                    console.error('Error deleting file:', deleteErr);
                }
            }, 5000);
        }
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        activeSessions: activeSessions.size,
        timestamp: new Date().toISOString()
    });
});

// Get active sessions
app.get('/api/sessions', (req, res) => {
    const sessions = Array.from(activeSessions.keys()).map(phoneNumber => ({
        phoneNumber,
        connected: activeSessions.get(phoneNumber)?.connected || false
    }));
    
    res.json({ sessions });
});

// Cleanup function
const cleanup = () => {
    console.log('Cleaning up...');
    activeSessions.forEach((session, phoneNumber) => {
        try {
            if (session.sock) {
                session.sock.end();
            }
        } catch (error) {
            console.error(`Error closing session for ${phoneNumber}:`, error);
        }
    });
    activeSessions.clear();
};

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start server
server.listen(PORT, () => {
    console.log(`WhatsApp Session Generator running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
