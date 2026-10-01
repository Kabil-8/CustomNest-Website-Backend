import rateLimit from 'express-rate-limit';

// Generic API limiter.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500, // Raised from 300 to avoid throttling legitimate store browsing
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.status(429).json({ message: 'Too many requests. Please try again later.' });
  },
});

// Stricter limiter for auth endpoints to slow down credential stuffing /
// brute-force attempts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.status(429).json({ message: 'Too many attempts. Please try again later.' });
  },
});
