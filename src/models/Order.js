import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    // Optional — null for custom handcrafted orders that have no catalogue product
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    name: { type: String, required: true },
    image: { type: String, default: '' },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    customization: {
      color: String,
      size: String,
      personalization: String,
      specialRequest: String,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    address: {
      fullName: String,
      phone: String,
      line1: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
    subtotal: { type: Number, required: true },
    shipping: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
      default: 'Pending',
    },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed'], default: 'Pending' },
    paymentMethod: { type: String, enum: ['card', 'upi', 'upi-qr', 'razorpay'], default: 'razorpay' },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    // UPI QR payment screenshot
    paymentScreenshot: { type: String, default: null },
    // Set when this order was created from an accepted custom order request
    customOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomOrderRequest', default: null },
    isCustomOrder: { type: Boolean, default: false },
  },
  { 
    timestamps: true,
    toJSON: { 
      transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

export default mongoose.model('Order', orderSchema);
