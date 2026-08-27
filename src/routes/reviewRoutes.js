import { Router } from 'express';
import { listReviews, createReview, deleteReview } from '../controllers/reviewController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/:productId', listReviews);
router.post('/:productId', requireAuth, createReview);
router.delete('/:id', requireAuth, requireRole('admin'), deleteReview);

export default router;
