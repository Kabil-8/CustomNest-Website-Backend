import 'dotenv/config';
import { connectDB } from '../config/db.js';
import Product from '../models/Product.js';

async function run() {
  await connectDB();
  const products = await Product.find({}).lean();
  console.log(`MongoDB total products: ${products.length}`);
  const snapchat = products.filter(p => p.name.includes('Snapchat') || p.slug.includes('snapchat'));
  console.log(`Snapchat products in DB: ${snapchat.length}`);
  for (const s of snapchat) {
    console.log("  DB Snapchat:", s._id, s.name, s.images);
  }
  process.exit(0);
}
run().catch(console.error);
