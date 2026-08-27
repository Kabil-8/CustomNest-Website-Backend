import { Router } from 'express';
import {
  createOrder,
  listMyOrders,
  getMyOrder,
  listAllOrders,
  updateOrderStatus,
  uploadPaymentScreenshot,
} from '../controllers/orderController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.post('/', createOrder);
router.get('/my', listMyOrders);
router.get('/mine', listMyOrders);
router.get('/my/:id', getMyOrder);
router.get('/mine/:id', getMyOrder);

router.get('/', requireRole('admin'), listAllOrders);
router.patch('/:id/status', requireRole('admin'), updateOrderStatus);
router.post('/:id/upload-screenshot', uploadPaymentScreenshot);

export default router;
