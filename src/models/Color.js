import mongoose from 'mongoose';

const colorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    hexCode: { type: String, required: true, trim: true },
    image: { type: String, default: null }, // Optional color swatch image
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

colorSchema.index({ name: 1 });

export default mongoose.model('Color', colorSchema);