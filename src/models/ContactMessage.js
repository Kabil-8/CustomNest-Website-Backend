import mongoose from 'mongoose';

const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, default: '', trim: true },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['Unread', 'Read', 'Replied'],
      default: 'Unread',
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('ContactMessage', contactMessageSchema);
