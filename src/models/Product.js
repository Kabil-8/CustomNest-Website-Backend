import mongoose from 'mongoose';

const sizeOptionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },   // e.g. "Small", "Medium", "Large"
    priceModifier: { type: Number, default: 0 },           // amount added to base price
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    yarnType: { 
      type: String, 
      enum: ['normal', 'acrylic', 'both'], 
      default: 'both' 
    },
    normalPrice: { type: Number, min: 0, default: null },
    acrylicPrice: { type: Number, min: 0, default: null },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0, default: null },
    images: { type: [String], default: [] },
    description: { type: String, default: '' },
    materials: { type: String, default: '' },
    care: { type: String, default: '' },
    featured: { type: Boolean, default: false },
    bestseller: { type: Boolean, default: false },
    isNew: { type: Boolean, default: false },
    customizable: { type: Boolean, default: false },
    stock: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    // Top 10 ranking position allocated by admin (1 = #1 Top product, 2 = #2, etc. 0 = unranked)
    featuredRank: { type: Number, default: 0, min: 0 },
    // Admin toggle for displaying this product on the Home Page
    showOnHome: { type: Boolean, default: false },
    // Per-product color options — admin picks from the global Color palette
    availableColors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Color', default: [] }],
    // Per-product size options with price modifiers
    sizes: { type: [sizeOptionSchema], default: [] },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', description: 'text' });

export default mongoose.model('Product', productSchema);
