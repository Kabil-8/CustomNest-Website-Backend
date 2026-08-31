import { Router } from 'express';
import {
  createMessage,
  listMessages,
  updateMessageStatus,
  deleteMessage,
} from '../controllers/contactController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Public: Submit a message
router.post('/', createMessage);

// Admin-only: list, status update, delete
router.get('/',      requireAuth, requireRole('admin'), listMessages);
router.patch('/:id', requireAuth, requireRole('admin'), updateMessageStatus);
router.delete('/:id', requireAuth, requireRole('admin'), deleteMessage);

export default router;
