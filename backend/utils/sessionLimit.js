
import Session from '../models/Session.js';
import User from '../models/User.js';

export const canCreateSession = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return { allowed: false, reason: 'User not found' };

  if (user.role === 'premium') return { allowed: true };

  const activeSessions = await Session.countDocuments({ user: userId, isActive: true });
  if (activeSessions >= 3) return { allowed: false, reason: 'Session limit reached' };

  return { allowed: true };
};
