import { Router } from 'express';
import { listAddresses, createAddress, deleteAddress } from '../controllers/addressController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', listAddresses);
router.post('/', createAddress);
router.delete('/:id', deleteAddress);

export default router;
