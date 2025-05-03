
import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['initializing', 'active', 'disconnected', 'expired'], default: 'initializing' },
  method: { type: String, enum: ['qr', 'pair'], required: true },
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now }
});

export default mongoose.model('Session', sessionSchema);
