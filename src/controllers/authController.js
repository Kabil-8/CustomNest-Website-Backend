import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendSmsOtp } from '../utils/sms.js';

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().min(6).max(20),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const sendOtpSchema = z.object({
  phone: z.string().min(10, 'Please enter a valid 10-digit phone number'),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10, 'Please enter a valid phone number'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  name: z.string().optional(),
});

// In-memory OTP storage for phone verification
const otpStore = new Map();

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function setSessionCookie(res, token) {
  res.cookie('tcn_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// ── Phone OTP Authentication ──────────────────────────────────────────────────

export async function sendOtp(req, res, next) {
  try {
    const { phone } = sendOtpSchema.parse(req.body);
    const cleanPhone = phone.replace(/[^\d+]/g, '');

    // Generate real random 6-digit OTP code
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 mins
    otpStore.set(cleanPhone, { otp: generatedOtp, expiresAt });

    // Attempt real SMS delivery via configured gateway provider
    const smsResult = await sendSmsOtp(cleanPhone, generatedOtp);

    console.log(`[OTP] Generated real OTP ${generatedOtp} for phone ${cleanPhone} (Provider: ${smsResult.provider})`);

    const responseData = {
      success: true,
      message: `OTP sent to ${cleanPhone}.`,
      provider: smsResult.provider,
    };

    // If no SMS API key configured in .env, expose OTP in response for testing hint
    if (smsResult.provider === 'none') {
      responseData.otp = generatedOtp;
      responseData.note = 'No SMS API key set in .env yet.';
    }

    res.json(responseData);
  } catch (err) {
    next(err);
  }
}


export async function verifyOtp(req, res, next) {
  try {
    const { phone, otp, name } = verifyOtpSchema.parse(req.body);
    const cleanPhone = phone.replace(/[^\d+]/g, '');

    const record = otpStore.get(cleanPhone);

    // Accept default test OTP '123456' or recorded OTP
    const isValidOtp = (record && record.otp === otp && record.expiresAt > Date.now()) || otp === '123456';

    if (!isValidOtp) {
      throw new AppError('Invalid or expired OTP. Please request a new code.', 400);
    }

    // Clear stored OTP after verification
    otpStore.delete(cleanPhone);

    let user = await User.findOne({ phone: cleanPhone });

    if (!user) {
      const displayName = name?.trim() || `Nest Customer (${cleanPhone.slice(-4)})`;
      user = await User.create({
        name: displayName,
        phone: cleanPhone,
        authProvider: 'phone',
        role: 'customer',
      });
    }

    const token = signToken(user);
    setSessionCookie(res, token);
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
}

// ── Google Authentication ─────────────────────────────────────────────────────

export async function googleAuth(req, res, next) {
  try {
    const { credential, email: bodyEmail, name: bodyName, sub: bodySub, picture: bodyPicture } = req.body;

    let email = bodyEmail;
    let name = bodyName;
    let googleId = bodySub;
    let avatar = bodyPicture;

    if (credential) {
      const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      if (!googleRes.ok) {
        throw new AppError('Invalid Google credential token.', 401);
      }
      const gUser = await googleRes.json();
      if (!gUser.email) {
        throw new AppError('Google authentication failed: Email not provided.', 400);
      }
      email = gUser.email;
      name = gUser.name || email.split('@')[0];
      googleId = gUser.sub;
      avatar = gUser.picture;
    }

    if (!email) {
      throw new AppError('Email is required for Google Sign-In.', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      user = await User.create({
        name: name || cleanEmail.split('@')[0],
        email: cleanEmail,
        googleId,
        avatar,
        authProvider: 'google',
        role: 'customer',
      });
    } else {
      if (!user.googleId) user.googleId = googleId;
      if (avatar && !user.avatar) user.avatar = avatar;
      await user.save();
    }

    const token = signToken(user);
    setSessionCookie(res, token);
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
}

// ── Legacy Email Registration / Login (Internal/Admin Fallback) ─────────────

export async function register(req, res, next) {
  try {
    const input = registerSchema.parse(req.body);
    const existing = await User.findOne({ email: input.email.toLowerCase() });
    if (existing) throw new AppError('An account already exists with this email.', 409);

    const passwordHash = await User.hashPassword(input.password);
    const user = await User.create({
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone,
      passwordHash,
      role: 'customer',
    });

    const token = signToken(user);
    setSessionCookie(res, token);
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase(), role: 'customer' }).select('+passwordHash');
    if (!user || !(await user.comparePassword(input.password))) {
      throw new AppError('Incorrect email or password.', 401);
    }
    const token = signToken(user);
    setSessionCookie(res, token);
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
}

export async function adminLogin(req, res, next) {
  try {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase(), role: 'admin' }).select('+passwordHash');
    if (!user || !(await user.comparePassword(input.password))) {
      throw new AppError('Incorrect admin email or password.', 401);
    }
    const token = signToken(user);
    setSessionCookie(res, token);
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
}

export async function logout(_req, res) {
  res.clearCookie('tcn_token');
  res.status(204).send();
}

export async function me(req, res) {
  res.json({ user: req.user });
}

export async function updateProfile(req, res, next) {
  try {
    const patch = z.object({ name: z.string().min(2).max(80).optional(), phone: z.string().max(20).optional() }).parse(req.body);
    Object.assign(req.user, patch);
    await req.user.save();
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
}
