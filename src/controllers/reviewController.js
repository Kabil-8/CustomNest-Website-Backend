import Review from '../models/Review.js';
import Product from '../models/Product.js';
import { AppError } from '../middleware/errorHandler.js';

async function recalcProductStats(productId) {
  const stats = await Review.aggregate([
    { $match: { product: productId, approved: true } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Product.findByIdAndUpdate(productId, {
    rating: stats[0] ? Math.round(stats[0].avg * 10) / 10 : 0,
    reviewCount: stats[0] ? stats[0].count : 0,
  });
}

export async function listReviews(req, res, next) {
  try {
    const reviews = await Review.find({ product: req.params.productId, approved: true })
      .populate('user', 'name')
      .sort({ createdAt: -1 });
    res.json({ reviews });
  } catch (err) {
    next(err);
  }
}

export async function createReview(req, res, next) {
  try {
    const { rating, comment } = req.body;
    // Prevent duplicate review from same user on same product
    const existing = await Review.findOne({ product: req.params.productId, user: req.user._id });
    if (existing) {
      // Update existing instead
      existing.rating = rating;
      existing.comment = comment;
      existing.approved = true;
      await existing.save();
      await recalcProductStats(existing.product);
      return res.json({ review: existing });
    }

    const review = await Review.create({
      product: req.params.productId,
      user: req.user._id,
      rating,
      comment,
    });
    await recalcProductStats(review.product);
    res.status(201).json({ review });
  } catch (err) {
    next(err);
  }
}

// ── Admin: list ALL reviews across all products ───────────────────────────────
export async function listAllReviews(req, res, next) {
  try {
    const reviews = await Review.find()
      .populate('user', 'name email')
      .populate('product', 'name slug images')
      .sort({ createdAt: -1 });
    res.json({ reviews });
  } catch (err) {
    next(err);
  }
}

// ── Admin: toggle approved status ────────────────────────────────────────────
export async function updateReview(req, res, next) {
  try {
    const { id } = req.params;
    const { approved } = req.body;
    const review = await Review.findByIdAndUpdate(id, { approved }, { new: true })
      .populate('user', 'name email')
      .populate('product', 'name slug images');
    if (!review) throw new AppError('Review not found.', 404);
    await recalcProductStats(review.product._id || review.product);
    res.json({ review });
  } catch (err) {
    next(err);
  }
}

// Admin moderation — delete
export async function deleteReview(req, res, next) {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) throw new AppError('Review not found.', 404);
    await recalcProductStats(review.product);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
