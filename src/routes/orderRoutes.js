import { Router } from 'express';
import {
  createOrder,
  listMyOrders,
  getMyOrder,
  listAllOrders,
  updateOrderStatus,
  uploadPaymentScreenshot,
  deleteOrder,
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
router.delete('/:id', requireRole('admin'), deleteOrder);
router.post('/:id/upload-screenshot', uploadPaymentScreenshot);

export default router;
