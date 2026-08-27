import Review from '../models/Review.js';
import Product from '../models/Product.js';
import { AppError } from '../middleware/errorHandler.js';

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
    const review = await Review.create({
      product: req.params.productId,
      user: req.user._id,
      rating,
      comment,
    });

    const stats = await Review.aggregate([
      { $match: { product: review.product, approved: true } },
      { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    if (stats[0]) {
      await Product.findByIdAndUpdate(review.product, {
        rating: Math.round(stats[0].avg * 10) / 10,
        reviewCount: stats[0].count,
      });
    }

    res.status(201).json({ review });
  } catch (err) {
    next(err);
  }
}

// Admin moderation
export async function deleteReview(req, res, next) {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) throw new AppError('Review not found.', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
