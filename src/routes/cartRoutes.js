import { Router } from 'express';
import { getCart, addToCart, updateCartItem, clearCart } from '../controllers/cartController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', getCart);
router.post('/', addToCart);
router.patch('/:itemId', updateCartItem);
router.delete('/', clearCart);

export default router;
