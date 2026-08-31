import { z } from 'zod';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { AppError } from '../middleware/errorHandler.js';
import { upload } from '../middleware/upload.js';

const addressSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(6),
  line1: z.string().min(3),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(3),
  country: z.string().min(1),
});

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().min(1),
        customization: z
          .object({ color: z.string().optional(), size: z.string().optional(), personalization: z.string().optional(), specialRequest: z.string().optional() })
          .optional(),
      })
    )
    .min(1),
  address: addressSchema,
  paymentMethod: z.enum(['card', 'upi', 'upi-qr', 'razorpay']).default('razorpay'),
});

// Prices are always recomputed server-side from the database, never trusted
// from the client, to prevent tampering with checkout totals.
export async function createOrder(req, res, next) {
  try {
    const input = createOrderSchema.parse(req.body);

    const productIds = input.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    let subtotal = 0;
    const items = input.items.map((i) => {
      const product = productMap.get(i.productId);
      if (!product) throw new AppError(`Product ${i.productId} not found.`, 400);
      if (product.stock < i.quantity) throw new AppError(`${product.name} is out of stock.`, 409, 'OUT_OF_STOCK');
      subtotal += product.price * i.quantity;
      return {
        product: product._id,
        name: product.name,
        image: product.images?.[0] ?? '',
        price: product.price,
        quantity: i.quantity,
        customization: i.customization,
      };
    });

    const shipping = subtotal >= 999 ? 0 : 79;
    const total = subtotal + shipping;
    const orderNumber = `TCN${Math.floor(100000 + Math.random() * 900000)}`;

    const order = await Order.create({
      orderNumber,
      user: req.user._id,
      items,
      address: input.address,
      subtotal,
      shipping,
      discount: 0,
      total,
      paymentMethod: input.paymentMethod,
      // In production this flips to 'Paid' only after the payment
      // provider's webhook confirms the charge server-side — never based on
      // a client-supplied "success" flag.
      paymentStatus: input.paymentMethod === 'upi-qr' ? 'Pending' : 'Paid',
    });

    // Decrement stock only after the order is successfully created.
    await Promise.all(
      input.items.map((i) => Product.findByIdAndUpdate(i.productId, { $inc: { stock: -i.quantity } }))
    );

    // Populate user info for response
    await order.populate('user', 'name email');

    // Ensure proper ID mapping for frontend
    const orderObj = order.toObject();
    orderObj.id = orderObj._id;
    delete orderObj._id;
    delete orderObj.__v;
    
    // Add customer info for frontend
    if (order.user) {
      orderObj.customerName = order.user.name || '';
      orderObj.customerEmail = order.user.email || '';
    }

    res.status(201).json({ order: orderObj });
  } catch (err) {
    next(err);
  }
}

export async function listMyOrders(req, res, next) {
  try {
    const orders = await Order.find({ user: req.user._id }).populate('user', 'name email').sort({ createdAt: -1 });
    // Ensure proper ID mapping for frontend
    const ordersWithId = orders.map(order => {
      const obj = order.toObject();
      obj.id = obj._id;
      delete obj._id;
      delete obj.__v;
      
      // Add customer info for frontend
      if (order.user) {
        obj.customerName = order.user.name || '';
        obj.customerEmail = order.user.email || '';
      }
      
      return obj;
    });
    res.json({ orders: ordersWithId });
  } catch (err) {
    next(err);
  }
}

export async function getMyOrder(req, res, next) {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id }).populate('user', 'name email');
    if (!order) throw new AppError('Order not found.', 404);
    
    let customOrderMessages = null;
    // If this order is linked to a custom order request, fetch the messages
    if (order.isCustomOrder && order.customOrderId) {
      const CustomOrderRequest = (await import('../models/CustomOrderRequest.js')).default;
      const customOrder = await CustomOrderRequest.findById(order.customOrderId);
      if (customOrder) {
        customOrderMessages = customOrder.messages || [];
      }
    }
    
    // Ensure proper ID mapping for frontend
    const orderObj = order.toObject();
    orderObj.id = orderObj._id;
    delete orderObj._id;
    delete orderObj.__v;
    
    // Add customer info for frontend
    if (order.user) {
      orderObj.customerName = order.user.name || '';
      orderObj.customerEmail = order.user.email || '';
    }
    
    res.json({ 
      order: orderObj,
      customOrderMessages // Include messages for frontend display
    });
  } catch (err) {
    next(err);
  }
}

// --- Admin ---

export async function listAllOrders(_req, res, next) {
  try {
    const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 });
    // Ensure proper ID mapping for frontend
    const ordersWithId = orders.map(order => {
      const obj = order.toObject();
      obj.id = obj._id;
      delete obj._id;
      delete obj.__v;
      return obj;
    });
    res.json({ orders: ordersWithId });
  } catch (err) {
    next(err);
  }
}

export async function updateOrderStatus(req, res, next) {
  try {
    const { status, estimatedDeliveryDate, trackingNumber, courierPartner } = req.body;
    
    if (status && !['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) {
      throw new AppError('Invalid order status.', 400);
    }

    const updateFields = {};
    if (status) updateFields.status = status;
    if (estimatedDeliveryDate !== undefined) updateFields.estimatedDeliveryDate = estimatedDeliveryDate;
    if (trackingNumber !== undefined) updateFields.trackingNumber = trackingNumber;
    if (courierPartner !== undefined) updateFields.courierPartner = courierPartner;

    if (status === 'Shipped') {
      updateFields.shippedAt = new Date();
    }

    const order = await Order.findByIdAndUpdate(req.params.id, updateFields, { new: true });
    if (!order) throw new AppError('Order not found.', 404);
    
    // Ensure proper ID mapping for frontend
    const orderObj = order.toObject();
    orderObj.id = orderObj._id;
    delete orderObj._id;
    delete orderObj.__v;
    
    res.json({ order: orderObj });
  } catch (err) {
    next(err);
  }
}

export async function uploadPaymentScreenshot(req, res, next) {
  try {
    // Use multer middleware for single file upload
    upload.single('paymentScreenshot')(req, res, async (err) => {
      if (err) {
        return next(new AppError(err.message || 'File upload failed', 400));
      }

      const order = await Order.findById(req.params.id);
      if (!order) {
        return next(new AppError('Order not found.', 404));
      }

      // Check order belongs to user (or admin)
      if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return next(new AppError('Not authorized.', 403));
      }

      if (!req.file) {
        return next(new AppError('No file uploaded.', 400));
      }

      // Save the screenshot path to the order
      order.paymentScreenshot = `/uploads/${req.file.filename}`;
      await order.save();

      const orderObj = order.toObject();
      orderObj.id = orderObj._id;
      delete orderObj._id;
      delete orderObj.__v;

      res.json({ order: orderObj, message: 'Screenshot uploaded successfully' });
    });
  } catch (err) {
    next(err);
  }
}
