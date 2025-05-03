
import express from 'express';
import auth from '../middleware/auth.js';
import { canCreateSession } from '../utils/sessionLimit.js';
import Session from '../models/Session.js';
import { generateCustomSessionId } from '../utils/sessionUtils.js';

const router = express.Router();

router.post('/create', auth, async (req, res) => {
  const { user } = req;

  const check = await canCreateSession(user.id);
  if (!check.allowed) return res.status(403).json({ error: check.reason });

  const sessionId = generateCustomSessionId();
  const newSession = new Session({
    user: user.id,
    sessionId,
    isActive: true,
    createdAt: new Date()
  });

  await newSession.save();
  res.status(201).json({ sessionId });
});

export default router;
