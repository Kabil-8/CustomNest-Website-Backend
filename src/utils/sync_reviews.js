import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Product from '../models/Product.js';
import Review from '../models/Review.js';

async function sync() {
  await connectDB();
  const products = await Product.find({});
  console.log(`Found ${products.length} products to check and synchronize reviews...`);

  let resetCount = 0;
  for (const p of products) {
    const stats = await Review.aggregate([
      { $match: { product: p._id, approved: true } },
      { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const rating = stats[0] ? Math.round(stats[0].avg * 10) / 10 : 0;
    const reviewCount = stats[0] ? stats[0].count : 0;
    
    await Product.findByIdAndUpdate(p._id, { rating, reviewCount });
    resetCount++;
  }

  console.log(`Successfully recalculated all ${resetCount} products! Fresh ratings and review counts applied.`);
  await mongoose.disconnect();
  process.exit(0);
}

sync().catch((err) => {
  console.error('Error syncing reviews:', err);
  process.exit(1);
});
