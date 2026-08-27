import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: false, sparse: true, lowercase: true, trim: true, index: true },
    phone: { type: String, sparse: true, index: true, trim: true },
    passwordHash: { type: String, required: false, select: false },
    googleId: { type: String, sparse: true, index: true },
    avatar: { type: String },
    authProvider: { type: String, enum: ['local', 'google', 'phone'], default: 'phone' },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  },
  { timestamps: true }
);

// Passwords are always hashed with bcrypt before storage
userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
