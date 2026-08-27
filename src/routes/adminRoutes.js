import { Router } from 'express';
import {
  listCustomers,
  dashboardStats,
  expensesStats,
  listExpenses,
  createExpense,
  deleteExpense,
} from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/customers', listCustomers);
router.get('/dashboard', dashboardStats);

// Expenses / raw material tracking
router.get('/expenses/stats', expensesStats);
router.get('/expenses',       listExpenses);
router.post('/expenses',      createExpense);
router.delete('/expenses/:id', deleteExpense);

export default router;
