import mongoose from 'mongoose';

/**
 * Expense — tracks raw material / supply purchases made by the admin.
 * Each entry represents one purchase event (e.g. bought 500g of yarn).
 */
const expenseSchema = new mongoose.Schema(
  {
    materialName: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['yarn', 'thread', 'fabric', 'stuffing', 'hooks_needles', 'packaging', 'dyes', 'other'],
      default: 'other',
    },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'unit', trim: true }, // e.g. grams, meters, pieces
    unitCost: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
    supplier: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    purchasedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

expenseSchema.index({ purchasedAt: -1 });
expenseSchema.index({ category: 1 });

export default mongoose.model('Expense', expenseSchema);
