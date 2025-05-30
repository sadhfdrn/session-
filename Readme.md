# WhatsApp Session Generator

A Node.js application that generates WhatsApp session credentials for bot development using the Baileys library. The session data is automatically sent to your WhatsApp number for easy access.

## Features

- 🔐 Generate WhatsApp session credentials (creds.json)
- 📱 Automatic session delivery via WhatsApp messages
- 🔌 Real-time Socket.IO communication
- 🌐 REST API endpoints
- 📁 Session file management
- 🔄 Auto-reconnection handling
- 💾 Backup download option

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- WhatsApp account
- Phone number for session generation

## Installation

1. **Clone the repository:**
```bash
git clone https://github.com/sadhfdrn/sessions.git
cd whatsapp-session-generator
```

2. **Install dependencies:**
```bash
npm install
```

3. **Create public directory (if not exists):**
```bash
mkdir public
```

4. **Start the server:**
```bash
npm start
```

The server will start on port 3000 by default.

## Dependencies

```json
{
  "@fizzxydev/baileys-pro": "WhatsApp Web API library",
  "@hapi/boom": "HTTP error handling",
  "express": "Web framework",
  "cors": "Cross-origin resource sharing",
  "socket.io": "Real-time communication",
  "pino": "Logging",
  "archiver": "File compression"
}
```

## Usage

### Method 1: Socket.IO (Recommended)

1. Connect to the server via Socket.IO
2. Emit `generateSession` event with phone number
3. Receive pairing code via `pairingCode` event
4. Enter the pairing code in WhatsApp
5. Session will be automatically sent to your WhatsApp

### Method 2: REST API

**Generate Session:**
```bash
POST http://localhost:3000/api/generate-session
Content-Type: application/json

{
  "phoneNumber": "1234567890"
}
```

## API Endpoints

### POST `/api/generate-session`
Generate a new WhatsApp session.

**Request Body:**
```json
{
  "phoneNumber": "1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Session generation started",
  "phoneNumber": "1234567890"
}
```

### GET `/api/health`
Check server health and active sessions.

**Response:**
```json
{
  "status": "OK",
  "activeSessions": 1,
  "timestamp": "2025-05-30T12:00:00.000Z"
}
```

### GET `/api/sessions`
Get list of active sessions.

**Response:**
```json
{
  "sessions": [
    {
      "phoneNumber": "1234567890",
      "connected": true
    }
  ]
}
```

### GET `/download/:filename`
Download session files (backup option).

## Socket.IO Events

### Client to Server

- `generateSession`: Start session generation
  ```javascript
  socket.emit('generateSession', { phoneNumber: '1234567890' });
  ```

### Server to Client

- `pairingCode`: Receive pairing code
  ```javascript
  socket.on('pairingCode', (data) => {
    console.log('Pairing code:', data.pairingCode);
  });
  ```

- `connectionStatus`: Connection status updates
  ```javascript
  socket.on('connectionStatus', (data) => {
    console.log('Status:', data.status); // 'initializing', 'connecting', 'connected', 'reconnecting', 'logged_out'
  });
  ```

- `sessionReady`: Session is ready and sent
  ```javascript
  socket.on('sessionReady', (data) => {
    console.log('Session sent:', data.sessionSent);
  });
  ```

- `error`: Error messages
  ```javascript
  socket.on('error', (data) => {
    console.log('Error:', data.message);
  });
  ```

## How It Works

1. **Initialization**: Server creates a session directory for the phone number
2. **Pairing**: Generates a pairing code that you enter in WhatsApp
3. **Authentication**: Establishes connection with WhatsApp servers
4. **Session Creation**: Combines authentication data into a single creds.json
5. **Delivery**: Sends two WhatsApp messages:
   - First: Usage instructions
   - Second: creds.json content in one line

## Session Data

The generated session includes:
- Authentication credentials
- Pre-keys for encryption
- Sender keys for group messaging
- Timestamp for tracking

## File Structure

```
project/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── README.md             # This file
├── public/               # Static files directory
└── sessions/             # Generated session data
    └── session_[number]/ # Individual session folders
```

## Environment Variables

- `PORT`: Server port (default: 3000)

## Error Handling

The application handles various error scenarios:
- Invalid phone numbers
- Connection failures
- Authentication errors
- File system errors
- Network issues

## Security Notes

⚠️ **Important Security Considerations:**

- Session data contains sensitive authentication information
- Never share your creds.json file with others
- Store session data securely
- Regenerate sessions if compromised
- Use HTTPS in production environments

## Troubleshooting

### Common Issues

1. **Session Generation Fails**
   - Verify phone number format
   - Check internet connection
   - Ensure WhatsApp is installed on the phone

2. **Pairing Code Not Working**
   - Try generating a new session
   - Verify the phone number is correct
   - Check if WhatsApp is already connected elsewhere

3. **Session Not Received**
   - Check WhatsApp messages
   - Verify phone number format
   - Look for download link in console

### Debug Mode

Enable debug logging by modifying the pino logger:
```javascript
const logger = pino({ level: 'debug' });
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is for educational purposes. Please comply with WhatsApp's Terms of Service when using this tool.

## Disclaimer

This tool is provided as-is for educational and development purposes. Users are responsible for complying with WhatsApp's Terms of Service and applicable laws. The developers are not responsible for any misuse of this tool.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the console logs
3. Verify your setup against this README
4. Create an issue in the repository

---

**Made with ❤️ for WhatsApp Bot Developers**
