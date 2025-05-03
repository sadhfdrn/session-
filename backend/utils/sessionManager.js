
import { makeWASocket, useSingleFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

const sessionsDir = './sessions';
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);

export async function startSessionWithQR(sessionId, sendDM) {
  const sessionFile = path.join(sessionsDir, sessionId + '.json');
  const { state, saveState } = useSingleFileAuthState(sessionFile);

  const sock = makeWASocket({ auth: state });
  sock.ev.on('connection.update', ({ qr, connection, lastDisconnect }) => {
    if (qr) sendDM(`Scan QR for ${sessionId}: ${qr}`);
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) startSessionWithQR(sessionId, sendDM);
    }
  });

  sock.ev.on('creds.update', saveState);
}

export async function startSessionWithPairCode(sessionId, sendDM) {
  const sessionFile = path.join(sessionsDir, sessionId + '.json');
  const { state, saveState } = useSingleFileAuthState(sessionFile);

  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on('connection.update', ({ pairingCode, connection }) => {
    if (pairingCode) sendDM(`Pairing code for ${sessionId}: ${pairingCode}`);
  });

  sock.ev.on('creds.update', saveState);
}
