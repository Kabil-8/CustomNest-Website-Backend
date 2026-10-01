import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';

import { connectDB } from './config/db.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { startCleanupJobs } from './utils/cleanupJobs.js';

import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import addressRoutes from './routes/addressRoutes.js';
import customOrderRoutes from './routes/customOrderRoutes.js';
import wishlistRoutes from './routes/wishlistRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import colorRoutes from './routes/colorRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import pushRoutes from './routes/pushRoutes.js';

const app = express();

// Security headers.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration supporting storefront origin, Vercel preview deploys, and local dev
const allowedOrigins = [
  'https://thecustomnest.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  ...(process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim().replace(/\/+$/, ''))
    : []),
];

function isOriginAllowed(origin) {
  if (!origin) return true;
  const clean = origin.trim().replace(/\/+$/, '');
  return (
    allowedOrigins.includes(clean) ||
    clean.endsWith('.vercel.app') ||
    clean.includes('localhost') ||
    clean.includes('127.0.0.1')
  );
}

// Global CORS preflight and header middleware ensuring headers are ALWAYS attached
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/custom-orders', customOrderRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/colors', colorRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/push', pushRoutes);

import fs from 'node:fs';
import path from 'node:path';

const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

import UploadedFile from './models/UploadedFile.js';

// Uploaded reference images (custom order attachments) and payment screenshots
// are served statically from disk first; if disk was wiped by Render restart,
// served seamlessly from persistent MongoDB Atlas storage!
app.use(['/uploads', '/api/uploads'], express.static(uploadDir, {
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
  },
}));

const serveUploadedFile = async (req, res, next) => {
  try {
    const filename = req.params.filename;
    const diskPath = path.join(uploadDir, filename);

    // 1. Try disk first
    if (fs.existsSync(diskPath)) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.sendFile(diskPath);
    }

    // 2. Fetch from persistent MongoDB storage
    const fileDoc = await UploadedFile.findOne({ filename });
    if (fileDoc && (fileDoc.data || fileDoc.base64)) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', fileDoc.mimeType || 'image/jpeg');

      if (fileDoc.data) {
        fs.promises.writeFile(diskPath, fileDoc.data).catch(() => {});
        return res.send(fileDoc.data);
      }
      if (fileDoc.base64) {
        const matches = fileDoc.base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (matches) {
          const buf = Buffer.from(matches[2], 'base64');
          fs.promises.writeFile(diskPath, buf).catch(() => {});
          return res.send(buf);
        }
      }
    }

    return res.status(404).send('Image file not found on server or database.');
  } catch (err) {
    next(err);
  }
};

app.get('/uploads/:filename', serveUploadedFile);
app.get('/api/uploads/:filename', serveUploadedFile);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function syncCategories() {
  try {
    const Category = (await import('./models/Category.js')).default;
    const Product = (await import('./models/Product.js')).default;

    // 1. Align any resin frames category to 'Resin Photo Frames' (do not touch other resin categories like resin keychain)
    await Category.updateMany(
      { $or: [{ slug: 'resin-frames' }, { slug: 'resin-photo-frames' }, { name: /^resin\s*photo\s*frames?$/i }, { name: /^resin\s*frames?$/i }] },
      { $set: { name: 'Resin Photo Frames', slug: 'resin-frames', collection: 'resin-frames' } }
    );

    // 2. Align 'Jumbo Kids Toys' to 'Kids Special'
    const kidsCat = await Category.findOneAndUpdate(
      { $or: [{ slug: 'kids-special' }, { slug: 'kids-toys-jumbo' }, { name: /jumbo kids/i }, { name: /kids special/i }] },
      { $set: { name: 'Kids Special', slug: 'kids-special', collection: 'plushies' } },
      { new: true, upsert: true }
    );

    // 3. Update any products linked to the old slug or ID
    if (kidsCat) {
      await Product.updateMany(
        { $or: [{ category: 'kids-toys-jumbo' }, { category: 'kids-special' }] },
        { $set: { category: kidsCat._id } }
      );
    }
  } catch (err) {
    console.warn('[server] Category sync skipped:', err.message);
  }
}

async function start() {
  await connectDB();
  await syncCategories();
  startCleanupJobs();
  app.listen(PORT, () => console.log(`[server] TheCustomNest API running on port ${PORT}`));
}

start().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});
