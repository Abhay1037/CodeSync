import { Router } from 'express';
import { User } from '../models/User.js';
import { signToken } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/auth/register - create an account and return a token. */
authRouter.post('/auth/register', async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (username.length < 2 || username.length > 24) {
      return res.status(400).json({ error: 'Username must be 2-24 characters.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid email is required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      const field = existing.email === email ? 'Email' : 'Username';
      return res.status(409).json({ error: `${field} is already taken.` });
    }

    const user = await User.create({
      username,
      email,
      passwordHash: await User.hashPassword(password),
    });

    return res.status(201).json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
});

/** POST /api/auth/login - exchange credentials for a token. */
authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    const user = await User.findOne({ email });
    // Same message for "no user" and "bad password" to avoid user enumeration.
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    return res.json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
});

/** GET /api/auth/me - resolve the current session's user. */
authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});
