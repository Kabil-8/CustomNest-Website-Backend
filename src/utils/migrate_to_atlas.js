import mongoose from 'mongoose';
import dns from 'node:dns';

// Ensure public DNS fallback for SRV record resolution on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  console.warn('Could not set custom DNS servers:', e.message);
}

const SOURCE_URI = 'mongodb://localhost:27017/thecustomnest';
const TARGET_URI = 'mongodb+srv://thecustomnest2023_db_user:PkTGr67iC1LF3YKr@cluster0.dzkfw5j.mongodb.net/thecustomnest?appName=Cluster0';

async function migrate() {
  console.log('--- Starting MongoDB Migration ---');
  console.log(`Source: ${SOURCE_URI}`);
  console.log(`Target: ${TARGET_URI}\n`);

  const sourceConn = await mongoose.createConnection(SOURCE_URI).asPromise();
  const targetConn = await mongoose.createConnection(TARGET_URI).asPromise();

  const collections = await sourceConn.db.listCollections().toArray();
  console.log(`Found ${collections.length} collections in source database.\n`);

  for (const colInfo of collections) {
    const colName = colInfo.name;
    if (colName.startsWith('system.')) continue;

    const sourceCol = sourceConn.db.collection(colName);
    const targetCol = targetConn.db.collection(colName);

    const docs = await sourceCol.find({}).toArray();
    const sourceCount = docs.length;

    console.log(`Processing collection [${colName}]: ${sourceCount} documents...`);

    if (sourceCount > 0) {
      // Clear target collection first for clean migration or bulk write
      await targetCol.deleteMany({});
      await targetCol.insertMany(docs);
      console.log(` -> Successfully copied ${sourceCount} documents to target [${colName}]`);
    } else {
      console.log(` -> Collection [${colName}] is empty, creating empty target collection`);
      // Ensure target collection exists
      try {
        await targetConn.db.createCollection(colName);
      } catch (err) {
        // Ignored if collection already exists
      }
    }

    // Copy Indexes
    try {
      const indexes = await sourceCol.indexes();
      for (const idx of indexes) {
        if (idx.name === '_id_') continue;
        const key = idx.key;
        delete idx.v;
        delete idx.ns;
        const options = { ...idx };
        delete options.key;
        await targetCol.createIndex(key, options);
      }
    } catch (idxErr) {
      console.warn(` Warning copying indexes for ${colName}:`, idxErr.message);
    }

    const targetCount = await targetCol.countDocuments();
    console.log(` -> Verification: Target [${colName}] count = ${targetCount}\n`);
  }

  await sourceConn.close();
  await targetConn.close();

  console.log('--- Migration Completed Successfully! ---');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
