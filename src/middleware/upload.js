import multer from 'multer';
import path from 'node:path';
import { AppError } from './errorHandler.js';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) || ALLOWED_EXT.has(ext)) {
    cb(null, true);
    return;
  }
  cb(new AppError('Only JPEG, PNG, WEBP, or HEIC/HEIF images are allowed.', 400));
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
});
