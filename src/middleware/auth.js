import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Verifies the JWT sent via httpOnly cookie (preferred) or Authorization
// header, and attaches the authenticated user to req.user. Never trusts a
// role or user id supplied directly by the client.
export async function requireAuth(req, res, next) {
  try {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    const token = req.cookies?.tcn_token || bearer;

    if (!token) {
      return res.status(401).json({ message: 'You must be signed in to do that.' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'Session is no longer valid.' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
}

// Role-based access control. Backend authorization is the source of truth —
// the frontend route guards are a UX convenience only, never the real
// security boundary.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to do that.' });
    }
    next();
  };
}
