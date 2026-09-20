/**
 * migrateCategories.js
 * Run once to rename categories in the live DB:
 *   - "Beaded Details" → "Bead Bracelets"
 *   - "Potted Flower Arrangements" → "Crochet Pots"
 *   - "Potted Flower Displays" → "Crochet Pots"
 *
 * Usage: node --experimental-vm-modules src/utils/migrateCategories.js
 *    or: node -e "import('./src/utils/migrateCategories.js')"
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;

if (!MONGO_URI) {
  console.error('❌  MONGO_URI env var is not set.');
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log('✅  Connected to MongoDB');

const db = mongoose.connection.db;
const col = db.collection('categories');

const renames = [
  { from: 'Beaded Details',            to: 'Bead Bracelets' },
  { from: 'Potted Flower Arrangements', to: 'Crochet Pots'  },
  { from: 'Potted Flower Displays',     to: 'Crochet Pots'  },
];

for (const { from, to } of renames) {
  const result = await col.updateMany({ name: from }, { $set: { name: to } });
  if (result.matchedCount > 0) {
    console.log(`✅  Renamed "${from}" → "${to}" (${result.modifiedCount} doc(s) updated)`);
  } else {
    console.log(`ℹ️   "${from}" not found in DB — skipping`);
  }
}

await mongoose.disconnect();
console.log('Done.');
