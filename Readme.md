# WhatsApp Session Generator

A complete WhatsApp session generator with modern frontend and backend using Baileys library. Generates pairing codes and automatically sends session strings to users' WhatsApp DMs.

## 🚀 Features

- **Modern Web Interface** - Clean, responsive UI with real-time status updates
- **Pairing Code Generation** - Uses Baileys to generate WhatsApp pairing codes
- **Automatic Session Delivery** - Sends session strings directly to user's WhatsApp
- **Session Management** - Handles multiple sessions and cleanup
- **Real-time Status** - Shows connection status and progress
- **Mobile Responsive** - Works perfectly on all devices

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- WhatsApp account

## 🛠️ Installation

1. **Clone or create the project directory:**
```bash
mkdir whatsapp-session-generator
cd whatsapp-session-generator
```

2. **Create the package.json file** (copy from the Package.json artifact above)

3. **Install dependencies:**
```bash
npm install
```

4. **Create the required directories:**
```bash
mkdir public sessions
```

5. **Create the server file** (`server.js`) - copy from the Backend artifact

6. **Create the frontend file** (`public/index.html`) - copy from the Frontend artifact

## 🚀 Usage

1. **Start the server:**
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

2. **Open your browser:**
Navigate to `http://localhost:3001`

3. **Generate session:**
   - Enter your phone number (numbers only, no + or spaces)
   - Click "Generate Pairing Code"
   - Enter the code in WhatsApp (Settings → Linked Devices → Link with phone number)
   - Your session string will be sent to your WhatsApp DM

## 📱 How It Works

1. **Frontend**: User enters phone number in the web interface
2. **Backend**: Generates pairing code using Baileys library
3. **WhatsApp**: User enters code in WhatsApp app
4. **Connection**: Backend establishes connection and generates session
5. **Delivery**: Session string is automatically sent to user's WhatsApp DM

## 🔧 API Endpoints

- `POST /api/request-pair-code` - Generate pairing code
- `GET /api/session-status/:phoneNumber` - Check session status
- `DELETE /api/cleanup-session/:phoneNumber` - Cleanup session
- `GET /api/health` - Health check

## ⚙️ Configuration

The server runs on port 3001 by default. You can change this by setting the `PORT` environment variable:

```bash
PORT=3000 npm start
```

## 🔒 Security Features

- **Session Isolation** - Each phone number gets its own session directory
- **Automatic Cleanup** - Sessions are cleaned up after successful connection
- **Input Validation** - Phone numbers are validated and sanitized
- **Error Handling** - Comprehensive error handling and logging

## 📁 Project Structure

```
whatsapp-session-generator/
├── server.js              # Backend server
├── package.json           # Dependencies
├── public/
│   └── index.html        # Frontend interface
└── sessions/             # Session storage (auto-created)
    └── session_*/        # Individual session directories
```

## 🐛 Troubleshooting

### Common Issues:

1. **"Pairing code not working"**
   - Make sure to enter phone number without + or spaces
   - Try using a different browser user agent in the code
   - Check WhatsApp app is updated to latest version

2. **"Session not being sent"**
   - Ensure the phone number is correct
   - Check that WhatsApp Web is not already connected
   - Verify internet connection is stable

3. **"Port already in use"**
   - Change the port: `PORT=3002 npm start`
   - Or kill the process using port 3001

### Known Workarounds for Baileys:

The code includes these fixes for current Baileys issues:
- Uses `'Chrome (Linux)'` browser user agent
- Handles phone numbers without + prefix
- Includes proper error handling for connection issues

## 🔄 Updates

To update Baileys to the latest version:
```bash
npm update @whiskeysockets/baileys
```

## ⚠️ Important Notes

- **Keep session strings secure** - Never share them publicly
- **One session per number** - Don't generate multiple sessions for the same number
- **Rate limiting** - Wait between requests to avoid being blocked
- **Legal compliance** - Ensure you comply with WhatsApp's Terms of Service

## 📞 Support

If you encounter issues:
1. Check the console logs for error messages
2. Verify all dependencies are installed correctly
3. Ensure Node.js version is 16 or higher
4. Check that ports are available

## 🎯 Production Deployment

For production deployment:

1. **Use PM2** for process management:
```bash
npm install -g pm2
pm2 start server.js --name whatsapp-session-generator
```

2. **Environment variables:**
```bash
export NODE_ENV=production
export PORT=3001
```

3. **Reverse proxy** (optional) with nginx or apache
4. **SSL certificate** for HTTPS (recommended)

## 📄 License

MIT License - feel free to use and modify as needed.

---

*This project uses the Baileys library for WhatsApp Web API integration. Make sure to comply with WhatsApp's Terms of Service when using this tool.*