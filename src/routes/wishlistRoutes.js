import { Router } from 'express';
import { getWishlist, toggleWishlist } from '../controllers/wishlistController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', getWishlist);
router.post('/:productId/toggle', toggleWishlist);

export default router;
