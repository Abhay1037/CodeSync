import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Issue a signed JWT for a user document.
 * `sub` is the standard "subject" claim and holds the user id.
 */
export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), username: user.username },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

/** Verify a token. Returns the payload, or null when invalid/expired. */
export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
}

/** Pull a bearer token out of an Authorization header. */
export function tokenFromHeader(header = '') {
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}
