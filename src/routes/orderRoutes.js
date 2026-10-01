import { Router } from 'express';
import {
  createOrder,
  listMyOrders,
  getMyBadgeCount,
  getMyOrder,
  listAllOrders,
  updateOrderStatus,
  uploadPaymentScreenshot,
  deletePaymentScreenshot,
  deleteOrder,
} from '../controllers/orderController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadScreenshot } from '../middleware/upload.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

router.use(requireAuth);

const handleScreenshotUpload = (req, res, next) => {
  uploadScreenshot.single('paymentScreenshot')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Payment screenshot cannot exceed 5MB. Please choose an image under 5MB.', 400, 'LIMIT_FILE_SIZE'));
      }
      return next(new AppError(err.message || 'File upload failed', 400));
    }
    next();
  });
};

router.post('/', createOrder);
router.get('/badge-count', getMyBadgeCount);
router.get('/my', listMyOrders);
router.get('/mine', listMyOrders);
router.get('/my/:id', getMyOrder);
router.get('/mine/:id', getMyOrder);

router.get('/', requireRole('admin'), listAllOrders);
router.patch('/:id/status', requireRole('admin'), updateOrderStatus);
router.delete('/:id', requireRole('admin'), deleteOrder);
router.post('/:id/upload-screenshot', handleScreenshotUpload, uploadPaymentScreenshot);
router.delete('/:id/payment-screenshot', deletePaymentScreenshot);

export default router;
