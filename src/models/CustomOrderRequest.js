import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, enum: ['admin', 'customer'], required: true },
    text:   { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const customOrderSchema = new mongoose.Schema(
  {
    user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name:         { type: String, required: true },
    email:        { type: String, required: true },
    phone:        { type: String, required: true },
    productType:  { type: String, required: true },
    colors:       String,      // color palette theme name
    yarnType:     { type: String, enum: ['normal', 'acrylic', 'either', ''], default: '' },
    size:         String,      // e.g. Small / Medium / Large / Custom
    quantity:     { type: Number, default: 1, min: 1 },
    budget:       String,
    deadline:     String,
    description:  { type: String, required: true },
    referenceImage: String,
    status: {
      type: String,
      enum: ['New', 'In Review', 'Quoted', 'Accepted', 'Declined'],
      default: 'New',
    },
    // Set by admin when accepting — becomes the checkout amount
    agreedPrice: { type: Number, min: 0, default: null },
    // Linked order once customer pays
    linkedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('CustomOrderRequest', customOrderSchema);
