import mongoose from 'mongoose';
import dns from 'node:dns';

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set. Copy .env.example to .env and configure it.');
  }
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (e) {
    // Ignore DNS override errors if in restricted environment
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log(`[db] connected -> ${mongoose.connection.name}`);
}

