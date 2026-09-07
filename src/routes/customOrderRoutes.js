import { Router } from 'express';
import {
  submitCustomOrder,
  listCustomOrders,
  listMyCustomOrders,
  updateCustomOrderStatus,
  adminSendMessage,
  customerSendMessage,
  createOrderFromCustomRequest,
  deleteCustomOrder,
} from '../controllers/customOrderController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

// ── Customer ──────────────────────────────────────────────────────────────────
router.post('/',               requireAuth, upload.fields([
  { name: 'referenceImage',  maxCount: 1 },
  { name: 'referenceImage2', maxCount: 1 },
  { name: 'referenceImage3', maxCount: 1 },
  { name: 'referenceImages', maxCount: 3 },
  { name: 'sampleImage',     maxCount: 1 },
]), submitCustomOrder);

router.get('/my',              requireAuth, listMyCustomOrders);
router.post('/:id/message',    requireAuth, customerSendMessage);
router.post('/:id/checkout',   requireAuth, createOrderFromCustomRequest);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get('/',                     requireAuth, requireRole('admin'), listCustomOrders);
router.patch('/:id/status',         requireAuth, requireRole('admin'), updateCustomOrderStatus);
router.post('/:id/admin-message',   requireAuth, requireRole('admin'), adminSendMessage);
router.delete('/:id',               requireAuth, requireRole('admin'), deleteCustomOrder);

export default router;
