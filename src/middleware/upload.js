import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { AppError } from './errorHandler.js';

const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Support all image types across modern mobile, desktop, and camera formats
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/avif',
  'image/gif',
  'image/bmp',
  'image/x-ms-bmp',
  'image/tiff',
  'image/x-tiff',
  'image/svg+xml',
  'image/pjpeg',
  'image/jfif',
]);

const ALLOWED_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  '.avif',
  '.gif',
  '.bmp',
  '.tiff',
  '.tif',
  '.svg',
]);

const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024;
const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024; // 5MB limit for payment screenshots

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  // Accept any standard or mobile image mime type or extension
  if (mime.startsWith('image/') || ALLOWED_MIME.has(mime) || ALLOWED_EXT.has(ext)) {
    cb(null, true);
    return;
  }
  cb(new AppError('Only image files (JPEG, PNG, WEBP, HEIC, AVIF, GIF, BMP, etc.) are allowed.', 400));
}

// General upload for catalog and custom order docs (up to 15MB)
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
});

// Dedicated screenshot upload with strict 5MB limit
export const uploadScreenshot = multer({
  storage,
  fileFilter,
  limits: { fileSize: SCREENSHOT_MAX_BYTES },
});

