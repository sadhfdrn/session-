
import Session from '../models/Session.js';
import User from '../models/User.js';
import { startBaileysSession } from '../whatsapp/baileys.js';

export const createSession = async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId);
  const existingCount = await Session.countDocuments({ user: userId, active: true });

  if (!user.isPremium && existingCount >= 3) {
    return res.status(403).json({ error: 'Session limit reached' });
  }

  const sessionId = `Samuel>${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const session = new Session({ sessionId, user: userId, active: true });
  await session.save();

  // Launch WhatsApp session
  await startBaileysSession(sessionId);

  return res.status(201).json({ sessionId });
};
