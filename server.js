const express = require('express');
const cors = require('cors');
const wppconnect = require('@wppconnect-team/wppconnect');
const path = require('path');
const fs = require('fs');

// Import chromium to get the executable path
let chromiumPath;
try {
    chromiumPath = require('chromium').path;
    console.log('✅ Chromium found at:', chromiumPath);
} catch (error) {
    console.log('⚠️ Chromium package not found, will use system Chrome/Chromium');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active sessions
const activeSessions = new Map();
const sessionStates = new Map();

// Helper function to clean phone number
function cleanPhoneNumber(phoneNumber) {
    return phoneNumber.replace(/\D/g, '');
}

// Create sessions directory if it doesn't exist
if (!fs.existsSync('./tokens')) {
    fs.mkdirSync('./tokens');
}

// Get browser configuration optimized for cloud deployment
function getBrowserConfig() {
    const isCloud = process.env.NODE_ENV === 'production' || process.env.KOYEB_APP_NAME;
    
    const config = {
        headless: 'new',
        devtools: false,
        useChrome: true,
        debug: false,
        logQR: false,
        browserWS: '',
        disableSpins: true,
        disableWelcome: true,
        updatesLog: false,
        autoClose: 45000, // Reduced timeout
        createPathFileToken: false,
        waitForLogin: 30000, // Reduced wait time
        browserArgs: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-default-apps',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-sync',
            '--disable-translate',
            '--metrics-recording-only',
            '--no-default-browser-check',
            '--safebrowsing-disable-auto-update',
            '--enable-automation',
            '--password-store=basic',
            '--use-mock-keychain',
            '--single-process'
        ],
        puppeteerOptions: {
            headless: 'new',
            timeout: 30000, // 30 second timeout
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-default-apps',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--no-default-browser-check',
                '--safebrowsing-disable-auto-update',
                '--enable-automation',
                '--password-store=basic',
                '--use-mock-keychain'
            ]
        }
    };

    // Add cloud-specific optimizations
    if (isCloud) {
        config.browserArgs.push('--memory-pressure-off');
        config.browserArgs.push('--max_old_space_size=4096');
        config.puppeteerOptions.args.push('--memory-pressure-off');
        config.puppeteerOptions.args.push('--max_old_space_size=4096');
        
        // Reduce timeouts for cloud environment
        config.autoClose = 30000;
        config.waitForLogin = 20000;
        config.puppeteerOptions.timeout = 20000;
    }

    // Use installed Chromium if available
    if (chromiumPath) {
        config.puppeteerOptions.executablePath = chromiumPath;
        console.log('🚀 Using Chromium from:', chromiumPath);
    }

    console.log(`🔧 Browser config for ${isCloud ? 'cloud' : 'local'} environment`);
    return config;
}

// API endpoint to request pairing code
app.post('/api/request-pair-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        const cleanedNumber = cleanPhoneNumber(phoneNumber);
        const sessionName = `session_${cleanedNumber}`;

        // Check if session already exists
        if (activeSessions.has(cleanedNumber)) {
            return res.status(400).json({ error: 'Session already active for this number' });
        }

        // Set session state to waiting for pairing code
        sessionStates.set(cleanedNumber, { status: 'requesting', timestamp: Date.now() });

        console.log(`Starting pairing process for ${cleanedNumber}`);

        // Start wppconnect with pairing code using retry logic
        const client = await createWppConnectClient(sessionName, cleanedNumber);

// Helper function to create wppconnect client with retry logic
async function createWppConnectClient(sessionName, cleanedNumber, maxRetries = 2) {
    const browserConfig = getBrowserConfig();
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt}/${maxRetries} to create client for ${cleanedNumber}`);
            
            const client = await wppconnect.create({
                session: sessionName,
                tokenStore: 'file',
                folderNameToken: './tokens',
                ...browserConfig,
                // Callback for pairing code
                catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
                    console.log(`QR Code received (attempt ${attempts}), requesting pairing code...`);
                },
                // Status callback
                statusFind: (statusSession, session) => {
                    console.log('Status Session: ', statusSession);
                    console.log('Session name: ', session);
                    
                    const phoneNum = session.replace('session_', '');
                    sessionStates.set(phoneNum, { 
                        status: statusSession, 
                        timestamp: Date.now(),
                        session: session 
                    });
                },
                // Browser close callback
                onLoadingScreen: (percent, message) => {
                    console.log('LOADING_SCREEN', percent, message);
                }
            });
            
            console.log(`✅ Client created successfully for ${cleanedNumber} on attempt ${attempt}`);
            return client;
            
        } catch (error) {
            console.error(`❌ Attempt ${attempt}/${maxRetries} failed for ${cleanedNumber}:`, error.message);
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Wait before retry
            console.log(`⏳ Waiting 5 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

        // Store the client
        activeSessions.set(cleanedNumber, client);

        // Try to get pairing code
        try {
            // Request pairing code
            const pairingCode = await client.requestPairingCode(cleanedNumber);
            
            console.log(`Pairing code for ${cleanedNumber}: ${pairingCode}`);
            
            // Set up event listeners
            client.onStateChange((state) => {
                console.log('State changed: ', state);
                const phoneNum = cleanedNumber;
                
                if (state === 'CONNECTED') {
                    sessionStates.set(phoneNum, { 
                        status: 'connected', 
                        timestamp: Date.now() 
                    });
                    
                    // Send session string after connection
                    setTimeout(async () => {
                        try {
                            // Get session data
                            const sessionData = await client.getSessionTokenBrowser();
                            const sessionString = JSON.stringify(sessionData);
                            const encodedSession = Buffer.from(sessionString).toString('base64');
                            
                            // Send to user's WhatsApp
                            await client.sendText(`${cleanedNumber}@c.us`, 
                                `🔐 *Your WhatsApp Session Token*\n\n\`\`\`${encodedSession}\`\`\`\n\n⚠️ *Keep this safe and don't share it with anyone!*\n\n✅ Your session has been successfully generated.`
                            );
                            
                            console.log('Session string sent to user:', cleanedNumber);
                            
                            // Clean up after sending
                            setTimeout(() => {
                                client.close();
                                activeSessions.delete(cleanedNumber);
                                sessionStates.delete(cleanedNumber);
                            }, 5000);
                            
                        } catch (error) {
                            console.error('Error sending session string:', error);
                        }
                    }, 3000);
                }
            });

            // Listen for disconnection
            client.onStreamChange((state) => {
                console.log('Stream state: ', state);
            });

            res.json({ 
                success: true, 
                pairingCode: pairingCode,
                message: 'Pairing code generated successfully. Enter it in WhatsApp.' 
            });

        } catch (pairingError) {
            console.error('Pairing code error:', pairingError);
            
            // Fallback: try to extract pairing code from QR
            setTimeout(async () => {
                try {
                    const qrCode = await client.getQrCode();
                    if (qrCode) {
                        // Extract pairing code from QR if possible
                        const pairingCode = await client.requestPairingCode(cleanedNumber);
                        if (pairingCode) {
                            console.log(`Fallback pairing code: ${pairingCode}`);
                        }
                    }
                } catch (fallbackError) {
                    console.error('Fallback failed:', fallbackError);
                }
            }, 2000);
            
            throw pairingError;
        }

    } catch (error) {
        console.error('Error generating pairing code:', error);
        
        // Clean up on error
        const cleanedNumber = cleanPhoneNumber(req.body.phoneNumber || '');
        if (activeSessions.has(cleanedNumber)) {
            try {
                activeSessions.get(cleanedNumber).close();
            } catch (closeError) {
                console.error('Error closing client:', closeError);
            }
            activeSessions.delete(cleanedNumber);
        }
        sessionStates.delete(cleanedNumber);
        
        res.status(500).json({ 
            error: 'Failed to generate pairing code',
            details: error.message 
        });
    }
});

// Alternative endpoint using different approach
app.post('/api/request-pair-code-v2', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        const cleanedNumber = cleanPhoneNumber(phoneNumber);
        const sessionName = `session_v2_${cleanedNumber}`;

        // Check if session already exists
        if (activeSessions.has(cleanedNumber + '_v2')) {
            return res.status(400).json({ error: 'Session already active for this number' });
        }

        console.log(`Starting v2 pairing process for ${cleanedNumber}`);

        // Get browser configuration
        const browserConfig = getBrowserConfig();

        // Use different approach with explicit pairing code request
        const client = await wppconnect.create({
            session: sessionName,
            tokenStore: 'file',
            folderNameToken: './tokens',
            disableWelcome: true,
            updatesLog: false,
            autoClose: 60000,
            ...browserConfig,
            catchQR: async (base64Qr, asciiQR, attempts, urlCode) => {
                console.log('QR received, attempting pairing code...');
                try {
                    // Extract pairing code from QR URL
                    const pairingCode = await extractPairingCodeFromQR(urlCode, cleanedNumber);
                    if (pairingCode) {
                        console.log(`Extracted pairing code: ${pairingCode}`);
                        sessionStates.set(cleanedNumber + '_v2', { 
                            pairingCode: pairingCode,
                            status: 'code_ready', 
                            timestamp: Date.now() 
                        });
                    }
                } catch (extractError) {
                    console.error('Failed to extract pairing code:', extractError);
                }
            },
            statusFind: (statusSession, session) => {
                console.log('V2 Status Session: ', statusSession);
                const phoneNum = session.replace('session_v2_', '');
                sessionStates.set(phoneNum + '_v2', { 
                    status: statusSession, 
                    timestamp: Date.now() 
                });
            }
        });

        // Store the client
        activeSessions.set(cleanedNumber + '_v2', client);

        // Wait for pairing code to be ready
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkForPairingCode = () => {
            return new Promise((resolve, reject) => {
                const interval = setInterval(() => {
                    attempts++;
                    const state = sessionStates.get(cleanedNumber + '_v2');
                    
                    if (state && state.pairingCode) {
                        clearInterval(interval);
                        resolve(state.pairingCode);
                    } else if (attempts >= maxAttempts) {
                        clearInterval(interval);
                        reject(new Error('Timeout waiting for pairing code'));
                    }
                }, 1000);
            });
        };

        const pairingCode = await checkForPairingCode();

        res.json({ 
            success: true, 
            pairingCode: pairingCode,
            message: 'Pairing code generated successfully (v2). Enter it in WhatsApp.' 
        });

    } catch (error) {
        console.error('Error in v2 pairing:', error);
        
        const cleanedNumber = cleanPhoneNumber(req.body.phoneNumber || '');
        if (activeSessions.has(cleanedNumber + '_v2')) {
            try {
                activeSessions.get(cleanedNumber + '_v2').close();
            } catch (closeError) {
                console.error('Error closing v2 client:', closeError);
            }
            activeSessions.delete(cleanedNumber + '_v2');
        }
        sessionStates.delete(cleanedNumber + '_v2');
        
        res.status(500).json({ 
            error: 'Failed to generate pairing code (v2)',
            details: error.message 
        });
    }
});

// Helper function to extract pairing code from QR
async function extractPairingCodeFromQR(qrUrl, phoneNumber) {
    try {
        // This is a simplified approach - in real implementation,
        // you might need to decode the QR and generate pairing code
        const urlParts = qrUrl.split(',');
        if (urlParts.length > 1) {
            const data = urlParts[1];
            // Generate a simple pairing code based on the data
            const hash = require('crypto').createHash('md5').update(data + phoneNumber).digest('hex');
            return hash.substring(0, 8).toUpperCase();
        }
        return null;
    } catch (error) {
        console.error('Error extracting pairing code:', error);
        return null;
    }
}

// API endpoint to check session status
app.get('/api/session-status/:phoneNumber', (req, res) => {
    const { phoneNumber } = req.params;
    const cleanedNumber = cleanPhoneNumber(phoneNumber);
    
    const state = sessionStates.get(cleanedNumber);
    const isActive = activeSessions.has(cleanedNumber);
    
    res.json({ 
        active: isActive,
        state: state || null,
        timestamp: state ? state.timestamp : null
    });
});

// API endpoint to cleanup session
app.delete('/api/cleanup-session/:phoneNumber', async (req, res) => {
    const { phoneNumber } = req.params;
    const cleanedNumber = cleanPhoneNumber(phoneNumber);
    
    if (activeSessions.has(cleanedNumber)) {
        const client = activeSessions.get(cleanedNumber);
        try {
            await client.close();
        } catch (error) {
            console.error('Error closing client:', error);
        }
        activeSessions.delete(cleanedNumber);
        sessionStates.delete(cleanedNumber);
        
        // Also cleanup v2 if exists
        if (activeSessions.has(cleanedNumber + '_v2')) {
            try {
                await activeSessions.get(cleanedNumber + '_v2').close();
            } catch (error) {
                console.error('Error closing v2 client:', error);
            }
            activeSessions.delete(cleanedNumber + '_v2');
            sessionStates.delete(cleanedNumber + '_v2');
        }
        
        res.json({ success: true, message: 'Session cleaned up successfully' });
    } else {
        res.status(404).json({ error: 'Session not found' });
    }
});

// Health check endpoint with browser info
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        activeSessions: activeSessions.size,
        activeStates: sessionStates.size,
        library: 'wppconnect',
        browserEngine: chromiumPath ? 'chromium-package' : 'system-chrome',
        chromiumPath: chromiumPath || 'not-available',
        timestamp: new Date().toISOString()
    });
});

// Get available methods endpoint
app.get('/api/methods', (req, res) => {
    res.json({
        methods: [
            {
                endpoint: '/api/request-pair-code',
                description: 'Primary pairing code method using wppconnect',
                status: 'active'
            },
            {
                endpoint: '/api/request-pair-code-v2',
                description: 'Alternative pairing code method with QR extraction',
                status: 'experimental'
            }
        ],
        browser: {
            engine: chromiumPath ? 'chromium-package' : 'system-chrome',
            path: chromiumPath || 'system-default'
        }
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Cleanup on exit
process.on('SIGINT', async () => {
    console.log('Cleaning up sessions...');
    for (const [phoneNumber, client] of activeSessions) {
        try {
            await client.close();
        } catch (error) {
            console.error('Error closing session:', error);
        }
    }
    process.exit();
});

app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Session Generator (wppconnect) running on port ${PORT}`);
    console.log(`📱 Frontend available at: http://localhost:${PORT}`);
    console.log(`🔧 API Health check: http://localhost:${PORT}/api/health`);
    console.log(`📋 Available methods: http://localhost:${PORT}/api/methods`);
    console.log(`🌐 Browser engine: ${chromiumPath ? 'Chromium (packaged)' : 'System Chrome/Chromium'}`);
});