import 'dotenv/config';
import { connectDB } from '../config/db.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';

async function run() {
  await connectDB();
  const addonCats = await Category.find({
    $or: [{ slug: /^add-?ons?$/i }, { name: /add-?on/i }]
  }).distinct('_id');

  console.log('Addon Category IDs:', addonCats);

  const res = await Product.updateMany(
    {
      $or: [
        { category: { $in: addonCats } },
        { slug: 'leaf-stick' },
        { slug: 'flower-buds' },
      ],
    },
    { $set: { isAddon: true, shippingCharge: 0 } }
  );
  console.log('Updated products to isAddon=true & shippingCharge=0:', res);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
