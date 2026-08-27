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

const app = express();

// Security headers.
app.use(helmet());

// CORS is locked to the configured storefront origin only, with credentials
// enabled so the httpOnly auth cookie can be sent.
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN?.split(',') ?? 'https://thecustomnest.vercel.app/',
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
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

// Uploaded reference images (custom order attachments) are served
// statically; validated on upload by middleware/upload.js.
app.use('/uploads', express.static('uploads'));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  startCleanupJobs();
  app.listen(PORT, () => console.log(`[server] TheCustomNest API running on port ${PORT}`));
}

start().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});
