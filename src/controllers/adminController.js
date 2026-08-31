import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Expense from '../models/Expense.js';
import CustomOrderRequest from '../models/CustomOrderRequest.js';
import ContactMessage from '../models/ContactMessage.js';
import Review from '../models/Review.js';

export async function getBadgeCounts(_req, res, next) {
  try {
    const [pendingOrders, newCustomOrders, unreadInquiries, pendingReviews] = await Promise.all([
      Order.countDocuments({
        status: { $in: ['Pending', 'Confirmed', 'Processing'] },
        $or: [
          { paymentScreenshot: { $exists: true, $nin: [null, ''] } },
          { paymentStatus: { $in: ['Paid', 'Pending Verification', 'Confirmed'] } },
        ],
      }),
      CustomOrderRequest.countDocuments({ status: { $in: ['New', 'In Review'] } }),
      ContactMessage.countDocuments({ status: 'Unread' }),
      Review.countDocuments({ approved: false }),
    ]);

    res.json({
      orders: pendingOrders,
      customOrders: newCustomOrders,
      messages: unreadInquiries,
      reviews: pendingReviews,
    });
  } catch (err) {
    next(err);
  }
}

export async function listCustomers(_req, res, next) {
  try {
    const customers = await User.find({ role: 'customer' }).sort({ createdAt: -1 });
    res.json({ customers });
  } catch (err) {
    next(err);
  }
}

export async function dashboardStats(_req, res, next) {
  try {
    const [orders, customerCount, productCount] = await Promise.all([
      Order.find({
        $or: [
          { paymentScreenshot: { $exists: true, $nin: [null, ''] } },
          { paymentStatus: { $in: ['Paid', 'Pending Verification', 'Confirmed', 'Processing', 'Shipped', 'Delivered'] } },
        ],
      }),
      User.countDocuments({ role: 'customer' }),
      Product.countDocuments(),
    ]);

    const totalSales = orders
      .filter((o) => o.status === 'Delivered')
      .reduce((sum, o) => sum + o.total, 0);
    const pendingOrders = orders.filter((o) => ['Pending', 'Confirmed', 'Processing'].includes(o.status)).length;
    const completedOrders = orders.filter((o) => o.status === 'Delivered').length;
    const lowStock = await Product.find({ stock: { $gt: 0, $lte: 3 } }).limit(10);

    res.json({
      totalSales,
      totalOrders: orders.length,
      totalCustomers: customerCount,
      totalProducts: productCount,
      pendingOrders,
      completedOrders,
      lowStock,
    });
  } catch (err) {
    next(err);
  }
}

// ── Expenses ──────────────────────────────────────────────────────────────────

/**
 * GET /admin/expenses/stats
 * Returns sold-items revenue breakdown + raw material expense totals.
 */
export async function expensesStats(_req, res, next) {
  try {
    // ── date boundaries ──────────────────────────────────────────────────────
    const now = new Date();

    // current month window
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // previous month window
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd   = new Date(thisMonthStart.getTime() - 1);

    // 6-month window for charts
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [allActiveOrders, expenses] = await Promise.all([
      // exclude Pending + Cancelled — only confirmed pipeline orders
      Order.find({ status: { $nin: ['Pending', 'Cancelled'] } }),
      Expense.find(),
    ]);

    // ── all-time totals ──────────────────────────────────────────────────────
    // Revenue and items only count once an order is Delivered (confirmed sale)
    const deliveredOrders  = allActiveOrders.filter((o) => o.status === 'Delivered');
    const deliveredRevenue = deliveredOrders.reduce((sum, o) => sum + o.total, 0);

    // totalRevenue = delivered-only (no Pending/Processing/Shipped speculation)
    const totalRevenue   = deliveredRevenue;
    const totalItemsSold = deliveredOrders.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
      0
    );

    const totalExpenses = expenses.reduce((sum, e) => sum + e.totalCost, 0);
    const netProfit = deliveredRevenue - totalExpenses;

    // ── month-over-month helpers ─────────────────────────────────────────────
    function pctChange(current, previous) {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    }

    // Revenue this month vs last month (Delivered only)
    const revenueThisMonth = deliveredOrders
      .filter((o) => new Date(o.createdAt) >= thisMonthStart)
      .reduce((sum, o) => sum + o.total, 0);
    const revenuePrevMonth = deliveredOrders
      .filter((o) => {
        const d = new Date(o.createdAt);
        return d >= prevMonthStart && d <= prevMonthEnd;
      })
      .reduce((sum, o) => sum + o.total, 0);

    // Items sold this month vs last (Delivered only)
    const itemsThisMonth = deliveredOrders
      .filter((o) => new Date(o.createdAt) >= thisMonthStart)
      .reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
    const itemsPrevMonth = deliveredOrders
      .filter((o) => {
        const d = new Date(o.createdAt);
        return d >= prevMonthStart && d <= prevMonthEnd;
      })
      .reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

    // Expenses this month vs last
    const expThisMonth = expenses
      .filter((e) => new Date(e.purchasedAt) >= thisMonthStart)
      .reduce((sum, e) => sum + e.totalCost, 0);
    const expPrevMonth = expenses
      .filter((e) => {
        const d = new Date(e.purchasedAt);
        return d >= prevMonthStart && d <= prevMonthEnd;
      })
      .reduce((sum, e) => sum + e.totalCost, 0);

    // ── category breakdown ───────────────────────────────────────────────────
    const byCategory = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.totalCost;
      return acc;
    }, {});

    // ── monthly aggregates (last 6 months) for charts ────────────────────────
    const monthlyExpenses = await Expense.aggregate([
      { $match: { purchasedAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$purchasedAt' }, month: { $month: '$purchasedAt' } },
          total: { $sum: '$totalCost' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthlyRevenue = await Order.aggregate([
      { $match: { status: 'Delivered', createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          total: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    res.json({
      totalRevenue,
      deliveredRevenue,
      totalItemsSold,
      totalExpenses,
      netProfit,
      byCategory,
      monthlyExpenses,
      monthlyRevenue,
      // month-over-month % changes (positive = up, negative = down)
      mom: {
        revenue:  pctChange(revenueThisMonth, revenuePrevMonth),
        items:    pctChange(itemsThisMonth,   itemsPrevMonth),
        expenses: pctChange(expThisMonth,     expPrevMonth),
        // current month figures for display
        revenueThisMonth,
        expensesThisMonth: expThisMonth,
        itemsThisMonth,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/expenses
 * List all raw material purchase entries (paginated).
 */
export async function listExpenses(req, res, next) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? '20', 10)));
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.category) filter.category = req.query.category;

    const [expenses, total] = await Promise.all([
      Expense.find(filter).sort({ purchasedAt: -1 }).skip(skip).limit(limit),
      Expense.countDocuments(filter),
    ]);

    res.json({ expenses, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/expenses
 * Log a new raw material purchase.
 */
export async function createExpense(req, res, next) {
  try {
    const { materialName, category, quantity, unit, unitCost, supplier, notes, purchasedAt } =
      req.body;

    if (!materialName || quantity == null || unitCost == null) {
      return res.status(400).json({ message: 'materialName, quantity and unitCost are required.' });
    }

    const totalCost = Number(quantity) * Number(unitCost);
    const expense = await Expense.create({
      materialName,
      category:    category ?? 'other',
      quantity:    Number(quantity),
      unit:        unit ?? 'unit',
      unitCost:    Number(unitCost),
      totalCost,
      supplier:    supplier ?? '',
      notes:       notes ?? '',
      purchasedAt: purchasedAt ? new Date(purchasedAt) : new Date(),
    });

    res.status(201).json({ expense });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /admin/expenses/:id
 * Remove a purchase entry.
 */
export async function deleteExpense(req, res, next) {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
