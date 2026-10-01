import mongoose from 'mongoose';

const uploadedFileSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, unique: true, index: true },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: 'image/jpeg' },
    size: { type: Number, default: 0 },
    data: { type: Buffer }, // Persistent binary data in MongoDB Atlas
    base64: { type: String }, // Data URL (data:image/...;base64,...)
    relatedModel: { type: String, enum: ['CustomOrderRequest', 'Order', 'Product', 'Category', 'Other'], default: 'Other' },
    relatedId: { type: mongoose.Schema.Types.ObjectId, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('UploadedFile', uploadedFileSchema);
