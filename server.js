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
const pairingSessions = new Map(); // Store pairing sessions

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
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
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

// Optimized browser configuration for pairing codes
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
        autoClose: 120000, // 2 minutes timeout
        createPathFileToken: false,
        waitForLogin: 60000, // 1 minute wait
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
            '--remote-debugging-port=0', // Use random port
            '--single-process', // Use single process for better stability
            '--no-crash-upload'
        ],
        puppeteerOptions: {
            headless: 'new',
            timeout: 90000, // 90 seconds timeout
            protocolTimeout: 90000,
            ignoreHTTPSErrors: true,
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
                '--remote-debugging-port=0',
                '--single-process',
                '--no-crash-upload',
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
        config.browserArgs.push(
            '--memory-pressure-off',
            '--max_old_space_size=2048',
            '--disable-background-networking',
            '--mute-audio',
            '--disable-software-rasterizer'
        );
        
        config.puppeteerOptions.args.push(
            '--memory-pressure-off',
            '--max_old_space_size=2048',
            '--disable-background-networking'
        );
    }

    console.log(`🔧 Browser config for ${isCloud ? 'cloud' : 'local'} environment`);
    return config;
}

// Enhanced client creation with better error handling
async function createWppConnectClient(sessionName, cleanedNumber, maxRetries = 2) {
    const browserConfig = getBrowserConfig();
    let client = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`📞 Attempt ${attempt}/${maxRetries} to create client for ${cleanedNumber}`);
            
            // Create client with promise race for timeout
            client = await Promise.race([
                wppconnect.create({
                    session: sessionName,
                    tokenStore: 'file',
                    folderNameToken: './tokens',
                    ...browserConfig,
                    catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
                        console.log(`📱 QR Code received (attempt ${attempts}) for ${cleanedNumber}`);
                        // Don't store QR for pair code method
                    },
                    statusFind: (statusSession, session) => {
                        console.log('📊 Status:', statusSession, 'for', session);
                        
                        const phoneNum = session.replace(/^session_/, '');
                        sessionStates.set(phoneNum, { 
                            ...sessionStates.get(phoneNum),
                            status: statusSession, 
                            timestamp: Date.now(),
                            session: session 
                        });
                        
                        // Handle different states
                        if (statusSession === 'CONNECTED') {
                            handleSuccessfulConnection(client, phoneNum);
                        } else if (statusSession === 'TIMEOUT' || statusSession === 'DISCONNECTED') {
                            console.log(`⚠️ Session ${statusSession} for ${phoneNum}`);
                        }
                    },
                    onLoadingScreen: (percent, message) => {
                        console.log('⏳ Loading:', percent + '%', message);
                    }
                }),
                // Timeout promise
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Client creation timeout after 120s')), 120000)
                )
            ]);
            
            console.log(`✅ Client created successfully for ${cleanedNumber} on attempt ${attempt}`);
            return client;
            
        } catch (error) {
            console.error(`❌ Attempt ${attempt}/${maxRetries} failed for ${cleanedNumber}:`, error.message);
            
            // Close any partial client
            if (client) {
                try {
                    await client.close();
                } catch (closeError) {
                    console.error('Error closing partial client:', closeError.message);
                }
                client = null;
            }
            
            // Clean up any partial sessions
            await cleanupSession(cleanedNumber, null, false);
            
            if (attempt === maxRetries) {
                throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
            }
            
            // Wait before retry
            const waitTime = 5000 * attempt;
            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Main pairing code endpoint
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
            status: 'initializing', 
            timestamp: Date.now(),
            phoneNumber: cleanedNumber
        });

        console.log(`🚀 Starting pairing process for ${cleanedNumber}`);

        // Create client
        client = await createWppConnectClient(sessionName, cleanedNumber);

        // Store the client
        activeSessions.set(cleanedNumber, client);
        pairingSessions.set(cleanedNumber, { client, startTime: Date.now() });

        // Wait a moment for client to fully initialize
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Request pairing code
        console.log(`📱 Requesting pairing code for ${cleanedNumber}...`);
        
        const pairingCode = await Promise.race([
            client.requestPairingCode(cleanedNumber),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Pairing code request timeout')), 60000)
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

            // Set up connection monitoring
            setupConnectionMonitoring(client, cleanedNumber);

            res.json({ 
                success: true, 
                pairingCode: pairingCode,
                message: 'Pairing code generated successfully. Enter it in WhatsApp within 60 seconds.',
                phoneNumber: cleanedNumber
            });
        } else {
            throw new Error('No pairing code received');
        }

    } catch (error) {
        console.error('💥 Error in pairing process:', error.message);
        
        // Comprehensive cleanup
        await cleanupSession(cleanedNumber, client);
        
        res.status(500).json({ 
            error: 'Failed to generate pairing code',
            details: error.message,
            phoneNumber: cleanedNumber || 'unknown'
        });
    }
});

// Set up connection monitoring
function setupConnectionMonitoring(client, cleanedNumber) {
    // Monitor state changes
    client.onStateChange((state) => {
        console.log('🔄 State changed:', state, 'for', cleanedNumber);
        
        sessionStates.set(cleanedNumber, { 
            ...sessionStates.get(cleanedNumber),
            status: state, 
            timestamp: Date.now() 
        });
        
        if (state === 'CONNECTED') {
            handleSuccessfulConnection(client, cleanedNumber);
        } else if (state === 'TIMEOUT' || state === 'DISCONNECTED') {
            setTimeout(() => cleanupSession(cleanedNumber, client), 5000);
        }
    });

    // Monitor stream changes
    client.onStreamChange((state) => {
        console.log('📡 Stream state:', state, 'for', cleanedNumber);
    });

    // Set timeout for pairing
    setTimeout(() => {
        const currentState = sessionStates.get(cleanedNumber);
        if (currentState && currentState.status !== 'CONNECTED') {
            console.log(`⏰ Pairing timeout for ${cleanedNumber}`);
            cleanupSession(cleanedNumber, client);
        }
    }, 120000); // 2 minutes timeout
}

// Handle successful connection
async function handleSuccessfulConnection(client, cleanedNumber) {
    try {
        console.log(`🎉 Successfully connected for ${cleanedNumber}`);
        
        // Update status
        sessionStates.set(cleanedNumber, { 
            ...sessionStates.get(cleanedNumber),
            status: 'CONNECTED', 
            timestamp: Date.now() 
        });
        
        // Wait for full initialization
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Get session data
        const sessionData = await client.getSessionTokenBrowser();
        const sessionString = JSON.stringify(sessionData);
        const encodedSession = Buffer.from(sessionString).toString('base64');
        
        // Send session string to user
        await client.sendText(`${cleanedNumber}@c.us`, 
            `🔐 *Your WhatsApp Session Token*\n\n\`\`\`${encodedSession}\`\`\`\n\n⚠️ *Keep this safe and don't share it with anyone!*\n\n✅ Your session has been successfully generated.`
        );
        
        console.log('📤 Session string sent to user:', cleanedNumber);
        
        // Update status
        sessionStates.set(cleanedNumber, { 
            ...sessionStates.get(cleanedNumber),
            status: 'completed', 
            timestamp: Date.now() 
        });
        
        // Schedule cleanup
        setTimeout(() => {
            cleanupSession(cleanedNumber, client);
        }, 15000); // Wait 15 seconds before cleanup
        
    } catch (error) {
        console.error('❌ Error in successful connection handler:', error.message);
        setTimeout(() => cleanupSession(cleanedNumber, client), 5000);
    }
}

// Enhanced cleanup function
async function cleanupSession(phoneNumber, client = null, removeFiles = true) {
    try {
        const cleanedNumber = typeof phoneNumber === 'string' ? cleanPhoneNumber(phoneNumber) : phoneNumber;
        
        console.log(`🧹 Cleaning up session for ${cleanedNumber}`);
        
        // Close client
        const sessionClient = client || activeSessions.get(cleanedNumber);
        if (sessionClient) {
            try {
                await Promise.race([
                    sessionClient.close(),
                    new Promise(resolve => setTimeout(resolve, 5000)) // 5s timeout for close
                ]);
                console.log(`✅ Client closed for ${cleanedNumber}`);
            } catch (closeError) {
                console.error('❌ Error closing client:', closeError.message);
            }
        }
        
        // Remove from maps
        activeSessions.delete(cleanedNumber);
        pairingSessions.delete(cleanedNumber);
        sessionStates.set(cleanedNumber, { 
            status: 'cleaned_up', 
            timestamp: Date.now(),
            phoneNumber: cleanedNumber
        });
        
        // Clean up token files if requested
        if (removeFiles) {
            const tokenPath = `./tokens/session_${cleanedNumber}`;
            if (fs.existsSync(tokenPath)) {
                try {
                    fs.rmSync(tokenPath, { recursive: true, force: true });
                    console.log(`🗑️ Removed token directory: ${tokenPath}`);
                } catch (fsError) {
                    console.error('❌ Error removing token directory:', fsError.message);
                }
            }
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
    const pairingSession = pairingSessions.get(cleanedNumber);
    
    res.json({ 
        active: isActive,
        state: state || null,
        timestamp: state ? state.timestamp : null,
        phoneNumber: cleanedNumber,
        pairingActive: !!pairingSession,
        pairingStartTime: pairingSession ? pairingSession.startTime : null
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
        pairingSessions: pairingSessions.size,
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
        sessionStates: Array.from(sessionStates.entries()),
        pairingSessions: Array.from(pairingSessions.keys())
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
        cleanupSession(phoneNumber, client, false)
    );
    
    await Promise.allSettled(cleanupPromises);
    console.log('✅ All sessions cleaned up');
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Auto-cleanup old sessions every 3 minutes
setInterval(() => {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    for (const [phoneNumber, state] of sessionStates.entries()) {
        if (state.status !== 'CONNECTED' && state.status !== 'completed' && (now - state.timestamp > maxAge)) {
            console.log(`🧹 Auto-cleaning old session: ${phoneNumber} (status: ${state.status})`);
            cleanupSession(phoneNumber);
        }
    }
    
    // Clean up old pairing sessions
    for (const [phoneNumber, pairingSession] of pairingSessions.entries()) {
        if (now - pairingSession.startTime > maxAge) {
            console.log(`🧹 Auto-cleaning old pairing session: ${phoneNumber}`);
            cleanupSession(phoneNumber);
        }
    }
}, 3 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Pair Code Generator running on port ${PORT}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`🔧 Health check: http://localhost:${PORT}/api/health`);
    console.log(`ℹ️ System info: http://localhost:${PORT}/api/info`);
    console.log(`🌐 Chrome path: ${CHROME_PATH || 'system-default'}`);
    console.log(`💾 Memory limit: ${process.env.NODE_OPTIONS || 'default'}`);
});