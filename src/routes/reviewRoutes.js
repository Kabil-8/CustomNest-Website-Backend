import { Router } from 'express';
import { listReviews, createReview, deleteReview, listAllReviews, updateReview } from '../controllers/reviewController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Public: get approved reviews for a product
router.get('/product/:productId', listReviews);

// Authenticated customer: post a review for a product
router.post('/product/:productId', requireAuth, createReview);

// Admin-only: list all reviews, approve/unapprove, delete
router.get('/',        requireAuth, requireRole('admin'), listAllReviews);
router.patch('/:id',   requireAuth, requireRole('admin'), updateReview);
router.delete('/:id',  requireAuth, requireRole('admin'), deleteReview);

export default router;
