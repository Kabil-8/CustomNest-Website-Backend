// Seeds the database with an admin user and the client's real product
// catalog (curated from their provided photography). Run with:
//   npm run seed
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'seedData.json'), 'utf-8'));

async function run() {
  await connectDB();

  const adminEmail = process.env.ADMIN_SEED_EMAIL;
  const adminPassword = process.env.ADMIN_SEED_PASSWORD;
  if (!adminEmail || !adminPassword || adminPassword === 'change_this_before_seeding') {
    throw new Error('Set ADMIN_SEED_EMAIL and a real ADMIN_SEED_PASSWORD in .env before seeding.');
  }

  const existingAdmin = await User.findOne({ email: adminEmail, role: 'admin' });
  if (!existingAdmin) {
    const passwordHash = await User.hashPassword(adminPassword);
    await User.create({ name: 'Ashwitha', email: adminEmail, role: 'admin', passwordHash });
    console.log(`[seed] created admin user ${adminEmail}`);
  } else {
    const passwordHash = await User.hashPassword(adminPassword);
    existingAdmin.passwordHash = passwordHash;
    existingAdmin.name = 'Ashwitha';
    await existingAdmin.save();
    console.log(`[seed] updated admin user ${adminEmail} credentials`);
  }

  const categoryDocs = {};
  for (const cat of seedData.categories) {
    const doc = await Category.findOneAndUpdate({ slug: cat.slug }, cat, { upsert: true, new: true });
    categoryDocs[cat.slug] = doc;
  }
  console.log(`[seed] upserted ${seedData.categories.length} categories`);

  // Wipe old products so uncurated / raw / broken items are removed
  const seedSlugs = seedData.products.map(p => p.slug);
  const deleted = await Product.deleteMany({ slug: { $nin: seedSlugs } });
  if (deleted.deletedCount > 0) {
    console.log(`[seed] purged ${deleted.deletedCount} uncurated/outdated products from database`);
  }

  let productCount = 0;
  for (const p of seedData.products) {
    const category = categoryDocs[p.category];
    if (!category) continue;
    await Product.findOneAndUpdate(
      { slug: p.slug },
      {
        name: p.name,
        slug: p.slug,
        category: category._id,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        images: p.images,
        description: p.description,
        materials: p.materials,
        care: p.care,
        featured: p.featured,
        bestseller: p.bestseller,
        isNew: p.isNew,
        customizable: p.customizable,
        stock: p.stock,
        rating: p.rating,
        reviewCount: p.reviewCount,
      },
      { upsert: true, new: true }
    );
    productCount += 1;
  }
  console.log(`[seed] upserted ${productCount} products`);

  console.log('[seed] done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
