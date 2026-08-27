import { Router } from 'express';
import {
  listProducts,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  listCategories,
} from '../controllers/productController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', listProducts);
router.get('/categories', listCategories);
router.get('/:slug', getProductBySlug);

router.post('/', requireAuth, requireRole('admin'), createProduct);
router.patch('/:id', requireAuth, requireRole('admin'), updateProduct);
router.delete('/:id', requireAuth, requireRole('admin'), deleteProduct);

export default router;
