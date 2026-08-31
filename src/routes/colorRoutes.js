import { Router } from 'express';
import { listColors, listActiveColors, createColor, updateColor, deleteColor } from '../controllers/colorController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Public route - get active colors for customization
router.get('/active', listActiveColors);

// Admin routes - require auth
router.use(requireAuth);
router.use(requireRole('admin'));

router.get('/', listColors);
router.post('/', createColor);
router.patch('/:id', updateColor);
router.delete('/:id', deleteColor);

export default router;