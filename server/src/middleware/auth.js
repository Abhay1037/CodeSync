import { User } from '../models/User.js';
import { tokenFromHeader, verifyToken } from '../services/authService.js';

/**
 * Populate `req.user` from a Bearer token.
 * Ends the request with 401 when the token is missing or invalid.
 */
export async function requireAuth(req, res, next) {
  try {
    const payload = verifyToken(tokenFromHeader(req.headers.authorization));
    if (!payload) return res.status(401).json({ error: 'Authentication required.' });

    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Invalid session.' });

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}
