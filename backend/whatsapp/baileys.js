
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { getIO } from '../utils/socket.js';

export const startBaileysSession = async (sessionId) => {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${sessionId}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    generateHighQualityLinkPreview: true,
    browser: ['Chrome', 'SessionBot', '1.0']
  });

  const io = getIO();

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr, pairingCode } = update;

    if (qr) {
      io.emit('qr', { sessionId, qr });
    }

    if (pairingCode) {
      io.emit('pairing-code', { sessionId, pairingCode });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBaileysSession(sessionId);
    } else if (connection === 'open') {
      console.log(`Session ${sessionId} connected`);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  return sock;
};
