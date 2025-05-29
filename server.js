const express = require('express');
const cors = require('cors');
const wppconnect = require('@wppconnect-team/wppconnect');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

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
    fs.mkdirSync('./tokens', { recursive: true });
}

// Detect Chrome executable path
function getChromePath() {
    const possiblePaths = [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
        process.env.CHROME_BIN,
        process.env.PUPPETEER_EXECUTABLE_PATH
    ];
    
    for (const chromePath of possiblePaths) {
        if (chromePath && fs.existsSync(chromePath)) {
            console.log('✅ Chrome found at:', chromePath);
            return chromePath;
        }
    }
    
    console.log('⚠️ Chrome not found in standard locations, using system default');
    return null;
}

const CHROME_PATH = getChromePath();

// Optimized browser configuration for cloud deployment
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
        autoClose: 60000, // Increased timeout
        createPathFileToken: false,
        waitForLogin: 45000, // Increased wait time
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
            '--disable-blink-features=AutomationControlled',
            '--disable-ipc-flooding-protection',
            '--disable-features=VizDisplayCompositor,VizServiceDisplayCompositor',
            '--disable-backgrounding-occluded-windows',
            '--disable-component-extensions-with-background-pages'
        ],
        puppeteerOptions: {
            headless: 'new',
            timeout: 60000, // Increased timeout to 60 seconds
            protocolTimeout: 60000, // Protocol timeout
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
                '--use-mock-keychain',
                '--disable-blink-features=AutomationControlled',
                '--remote-debugging-port=9222',
                '--disable-ipc-flooding-protection'
            ]
        }
    };

    // Set Chrome executable path
    if (CHROME_PATH) {
        config.puppeteerOptions.executablePath = CHROME_PATH;
        console.log('🚀 Using Chrome from:', CHROME_PATH);
    }

    // Cloud-specific optimizations
    if (isCloud) {
        config.browserArgs.push('--memory-pressure-off');
        config.browserArgs.push('--max_old_space_size=4096');
        config.browserArgs.push('--disable-background-networking');
        config.browserArgs.push('--disable-default-apps');
        config.browserArgs.push('--disable-extensions');
        config.browserArgs.push('--mute-audio');
        config.browserArgs.push('--no-default-browser-check');
        config.browserArgs.push('--no-first-run');
        config.browserArgs.push('--disable-background-timer-throttling');
        config.browserArgs.push('--disable-backgrounding-occluded-windows');
        
        config.puppeteerOptions.args.push('--memory-pressure-off');
        config.puppeteerOptions.args.push('--max_old_space_size=4096');
        config.puppeteerOptions.args.push('--disable-background-networking');
    }

    console.log(`🔧 Browser config for ${isCloud ? 'cloud' : 'local'} environment`);
    return config;
}

// Enhanced client creation with better error handling and retries
async function createWppConnectClient(sessionName, cleanedNumber, maxRetries = 3) {
    const browserConfig = getBrowserConfig();
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt}/${maxRetries} to create client for ${cleanedNumber}`);
            
            const client = await Promise.race([
                wppconnect.create({
                    session: sessionName,
                    tokenStore: 'file',
                    folderNameToken: './tokens',
                    ...browserConfig,
                    catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
                        console.log(`📱 QR Code received (attempt ${attempts}) for ${cleanedNumber}`);
                        // Store QR info for potential pairing code extraction
                        sessionStates.set(cleanedNumber, { 
                            ...sessionStates.get(cleanedNumber),
                            qrReceived: true,
                            qrAttempts: attempts,
                            qrUrl: urlCode,
                            timestamp: Date.now()
                        });
                    },
                    statusFind: (statusSession, session) => {
                        console.log('📊 Status Session:', statusSession, 'for', session);
                        
                        const phoneNum = session.replace(/^session_/, '');
                        sessionStates.set(phoneNum, { 
                            ...sessionStates.get(phoneNum),
                            status: statusSession, 
                            timestamp: Date.now(),
                            session: session 
                        });
                    },
                    onLoadingScreen: (percent, message) => {
                        console.log('⏳ Loading:', percent + '%', message);
                    }
                }),
                // Timeout promise to prevent hanging
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Client creation timeout')), 90000)
                )
            ]);
            
            console.log(`✅ Client created successfully for ${cleanedNumber} on attempt ${attempt}`);
            return client;
            
        } catch (error) {
            console.error(`❌ Attempt ${attempt}/${maxRetries} failed for ${cleanedNumber}:`, error.message);
            
            // Clean up any partial sessions
            try {
                const tokenPath = `./tokens/session_${cleanedNumber}`;
                if (fs.existsSync(tokenPath)) {
                    fs.rmSync(tokenPath, { recursive: true, force: true });
                    console.log(`🧹 Cleaned up token directory: ${tokenPath}`);
                }
            } catch (cleanupError) {
                console.error('Cleanup error:', cleanupError.message);
            }
            
            if (attempt === maxRetries) {
                throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
            }
            
            // Progressive backoff
            const waitTime = Math.min(5000 * attempt, 15000);
            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Main pairing code endpoint with enhanced error handling
app.post('/api/request-pair-code', async (req, res) => {
    let cleanedNumber = '';
    let client = null;
    
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        cleanedNumber = cleanPhoneNumber(phoneNumber);
        const sessionName = `session_${cleanedNumber}`;

        // Validate phone number format
        if (cleanedNumber.length < 10 || cleanedNumber.length > 15) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        // Check if session already exists
        if (activeSessions.has(cleanedNumber)) {
            return res.status(400).json({ 
                error: 'Session already active for this number. Please wait or cleanup first.' 
            });
        }

        // Set initial session state
        sessionStates.set(cleanedNumber, { 
            status: 'requesting', 
            timestamp: Date.now(),
            phoneNumber: cleanedNumber
        });

        console.log(`🚀 Starting pairing process for ${cleanedNumber}`);

        // Create client with timeout protection
        client = await Promise.race([
            createWppConnectClient(sessionName, cleanedNumber),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Overall process timeout')), 120000)
            )
        ]);

        // Store the client
        activeSessions.set(cleanedNumber, client);

        // Set up event listeners first
        client.onStateChange((state) => {
            console.log('🔄 State changed:', state, 'for', cleanedNumber);
            
            sessionStates.set(cleanedNumber, { 
                ...sessionStates.get(cleanedNumber),
                status: state, 
                timestamp: Date.now() 
            });
            
            if (state === 'CONNECTED') {
                handleSuccessfulConnection(client, cleanedNumber);
            }
        });

        client.onStreamChange((state) => {
            console.log('📡 Stream state:', state, 'for', cleanedNumber);
        });

        // Try to get pairing code with timeout
        try {
            console.log(`📱 Requesting pairing code for ${cleanedNumber}...`);
            
            const pairingCode = await Promise.race([
                client.requestPairingCode(cleanedNumber),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Pairing code request timeout')), 45000)
                )
            ]);
            
            if (pairingCode) {
                console.log(`✅ Pairing code generated for ${cleanedNumber}: ${pairingCode}`);
                
                sessionStates.set(cleanedNumber, { 
                    ...sessionStates.get(cleanedNumber),
                    status: 'code_generated',
                    pairingCode: pairingCode,
                    timestamp: Date.now() 
                });

                res.json({ 
                    success: true, 
                    pairingCode: pairingCode,
                    message: 'Pairing code generated successfully. Enter it in WhatsApp within 60 seconds.',
                    phoneNumber: cleanedNumber
                });
            } else {
                throw new Error('No pairing code received');
            }

        } catch (pairingError) {
            console.error('❌ Pairing code generation failed:', pairingError.message);
            throw new Error(`Pairing code generation failed: ${pairingError.message}`);
        }

    } catch (error) {
        console.error('💥 Error in pairing process:', error.message);
        
        // Comprehensive cleanup
        if (cleanedNumber) {
            await cleanupSession(cleanedNumber, client);
        }
        
        res.status(500).json({ 
            error: 'Failed to generate pairing code',
            details: error.message,
            phoneNumber: cleanedNumber || 'unknown'
        });
    }
});

// Handle successful connection
async function handleSuccessfulConnection(client, cleanedNumber) {
    try {
        console.log(`🎉 Successfully connected for ${cleanedNumber}`);
        
        // Wait a bit for full initialization
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Get and send session data
        const sessionData = await client.getSessionTokenBrowser();
        const sessionString = JSON.stringify(sessionData);
        const encodedSession = Buffer.from(sessionString).toString('base64');
        
        await client.sendText(`${cleanedNumber}@c.us`, 
            `🔐 *Your WhatsApp Session Token*\n\n\`\`\`${encodedSession}\`\`\`\n\n⚠️ *Keep this safe and don't share it with anyone!*\n\n✅ Your session has been successfully generated.`
        );
        
        console.log('📤 Session string sent to user:', cleanedNumber);
        
        // Schedule cleanup
        setTimeout(() => {
            cleanupSession(cleanedNumber, client);
        }, 10000);
        
    } catch (error) {
        console.error('❌ Error in successful connection handler:', error.message);
    }
}

// Enhanced cleanup function
async function cleanupSession(phoneNumber, client = null) {
    try {
        const cleanedNumber = typeof phoneNumber === 'string' ? cleanPhoneNumber(phoneNumber) : phoneNumber;
        
        console.log(`🧹 Cleaning up session for ${cleanedNumber}`);
        
        // Close client if provided or get from active sessions
        const sessionClient = client || activeSessions.get(cleanedNumber);
        if (sessionClient) {
            try {
                await sessionClient.close();
                console.log(`✅ Client closed for ${cleanedNumber}`);
            } catch (closeError) {
                console.error('❌ Error closing client:', closeError.message);
            }
        }
        
        // Remove from active sessions and states
        activeSessions.delete(cleanedNumber);
        sessionStates.delete(cleanedNumber);
        
        // Clean up token files
        const tokenPath = `./tokens/session_${cleanedNumber}`;
        if (fs.existsSync(tokenPath)) {
            fs.rmSync(tokenPath, { recursive: true, force: true });
            console.log(`🗑️ Removed token directory: ${tokenPath}`);
        }
        
    } catch (error) {
        console.error('❌ Error in cleanup:', error.message);
    }
}

// Session status endpoint
app.get('/api/session-status/:phoneNumber', (req, res) => {
    const { phoneNumber } = req.params;
    const cleanedNumber = cleanPhoneNumber(phoneNumber);
    
    const state = sessionStates.get(cleanedNumber);
    const isActive = activeSessions.has(cleanedNumber);
    
    res.json({ 
        active: isActive,
        state: state || null,
        timestamp: state ? state.timestamp : null,
        phoneNumber: cleanedNumber
    });
});

// Manual cleanup endpoint
app.delete('/api/cleanup-session/:phoneNumber', async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const cleanedNumber = cleanPhoneNumber(phoneNumber);
        
        await cleanupSession(cleanedNumber);
        
        res.json({ 
            success: true, 
            message: 'Session cleaned up successfully',
            phoneNumber: cleanedNumber 
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to cleanup session',
            details: error.message 
        });
    }
});

// Enhanced health check
app.get('/api/health', (req, res) => {
    const memUsage = process.memoryUsage();
    
    res.json({ 
        status: 'healthy', 
        activeSessions: activeSessions.size,
        activeStates: sessionStates.size,
        library: 'wppconnect',
        chromePath: CHROME_PATH || 'system-default',
        memory: {
            rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
        },
        uptime: Math.round(process.uptime()) + ' seconds',
        timestamp: new Date().toISOString()
    });
});

// Get system info
app.get('/api/info', (req, res) => {
    res.json({
        nodejs: process.version,
        platform: process.platform,
        arch: process.arch,
        chromePath: CHROME_PATH,
        environment: process.env.NODE_ENV || 'development',
        activeSessions: Array.from(activeSessions.keys()),
        sessionStates: Array.from(sessionStates.entries())
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Graceful shutdown
async function gracefulShutdown() {
    console.log('🛑 Shutting down gracefully...');
    
    const cleanupPromises = Array.from(activeSessions.entries()).map(([phoneNumber, client]) => 
        cleanupSession(phoneNumber, client)
    );
    
    await Promise.allSettled(cleanupPromises);
    console.log('✅ All sessions cleaned up');
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Auto-cleanup old sessions every 5 minutes
setInterval(() => {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    for (const [phoneNumber, state] of sessionStates.entries()) {
        if (now - state.timestamp > maxAge) {
            console.log(`🧹 Auto-cleaning old session: ${phoneNumber}`);
            cleanupSession(phoneNumber);
        }
    }
}, 5 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Session Generator running on port ${PORT}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`🔧 Health check: http://localhost:${PORT}/api/health`);
    console.log(`ℹ️ System info: http://localhost:${PORT}/api/info`);
    console.log(`🌐 Chrome path: ${CHROME_PATH || 'system-default'}`);
    console.log(`💾 Memory limit: ${process.env.NODE_OPTIONS || 'default'}`);
});