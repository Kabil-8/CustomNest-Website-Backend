import { z } from 'zod';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import UploadedFile from '../models/UploadedFile.js';
import { AppError } from '../middleware/errorHandler.js';
import { upload, uploadScreenshot } from '../middleware/upload.js';
import { notifyNewOrder, notifyPaymentScreenshot } from '../services/notifications.js';
import { persistUploadedFile, removeUploadedFile } from './customOrderController.js';

const addressSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(6),
  line1: z.string().min(3),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(3),
  country: z.string().min(1),
});

// Global shipping rates (₹)
const SHIPPING_TN = 50;      // Tamil Nadu (local)
const SHIPPING_OUTER = 80;   // Outside Tamil Nadu

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().min(1),
        customization: z
          .object({
            color: z.string().optional(),
            size: z.string().optional(),
            personalization: z.string().optional(),
            specialRequest: z.string().optional(),
            yarnType: z.string().optional(),
            resinOption: z.string().optional(),
            text: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
    )
    .min(1),
  address: addressSchema,
  paymentMethod: z.enum(['card', 'upi', 'upi-qr', 'razorpay']).default('razorpay'),
  // Frontend passes this based on address state field
  isOuterState: z.boolean().optional().default(false),
  customerNotes: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});


// Prices are always recomputed server-side from the database, never trusted
// from the client, to prevent tampering with checkout totals.
export async function createOrder(req, res, next) {
  try {
    const input = createOrderSchema.parse(req.body);

    const productIds = input.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds } }).populate('category', 'name slug');
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    let subtotal = 0;
    let maxPerProductShipping = null; // track highest per-product shipping charge for regular products
    let hasRegularProducts = false;

    const items = input.items.map((i) => {
      const product = productMap.get(i.productId);
      if (!product) throw new AppError(`Product ${i.productId} not found.`, 400);
      // Handmade crochet & resin pieces are handcrafted made-to-order
      subtotal += product.price * i.quantity;

      const catSlug = (product.category && typeof product.category === 'object' ? product.category.slug : '') || '';
      const catName = (product.category && typeof product.category === 'object' ? product.category.name : '') || '';
      const catId = (product.category && typeof product.category === 'object' ? product.category._id?.toString() : String(product.category || ''));
      const isAddon = Boolean(
        product.isAddon ||
        catSlug === 'add-ons' ||
        catSlug === 'addon' ||
        catId === '6a7849c1abe39c4544be29d9' ||
        /add-?on/i.test(catName)
      );

      // Add-on products have NO shipping fee. Only regular non-addon products determine shipping.
      if (!isAddon) {
        hasRegularProducts = true;
        if (product.shippingCharge !== null && product.shippingCharge !== undefined) {
          if (maxPerProductShipping === null || product.shippingCharge > maxPerProductShipping) {
            maxPerProductShipping = product.shippingCharge;
          }
        }
      }

      return {
        product: product._id,
        name: product.name,
        image: product.images?.[0] ?? '',
        price: product.price,
        quantity: i.quantity,
        customization: i.customization,
      };
    });

    // Determine shipping:
    // Free shipping threshold: orders beyond ₹799 get 100% free shipping!
    // If order has ONLY add-on products -> ₹0 shipping money!
    // If order has regular products -> regular products determine shipping rate (add-ons do not add shipping)
    const FREE_SHIPPING_THRESHOLD = 799;
    let shipping = 0;
    if (subtotal > FREE_SHIPPING_THRESHOLD) {
      shipping = 0; // Free shipping for orders above ₹799!
    } else if (hasRegularProducts) {
      const globalRate = input.isOuterState ? SHIPPING_OUTER : SHIPPING_TN;
      shipping = maxPerProductShipping !== null ? maxPerProductShipping : globalRate;
    } else {
      shipping = 0; // Free shipping for add-ons!
    }

    const total = subtotal + shipping;
    const orderNumber = `TCN${Math.floor(100000 + Math.random() * 900000)}`;
    const customerNotes = (input.customerNotes || input.notes || '').trim();

    const order = await Order.create({
      orderNumber,
      user: req.user._id,
      items,
      address: input.address,
      customerNotes,
      subtotal,
      shipping,
      discount: 0,
      total,
      paymentMethod: input.paymentMethod || 'upi-qr',
      paymentStatus: 'Pending',
    });

    // Decrement stock only after the order is successfully created.
    await Promise.all(
      input.items.map((i) => Product.findByIdAndUpdate(i.productId, { $inc: { stock: -i.quantity } }))
    );

    // Populate user info for response
    await order.populate('user', 'name email');

    // Send push notification to admin about new order
    notifyNewOrder(order).catch(err => console.error('[notification] Failed to send new order notification:', err));

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
    // Only return placed orders that have an uploaded payment screenshot or verified payment
    const orders = await Order.find({
      user: req.user._id,
      $or: [
        { paymentScreenshot: { $exists: true, $nin: [null, ''] } },
        { paymentStatus: { $in: ['Paid', 'Pending Verification', 'Confirmed', 'Processing', 'Shipped', 'Delivered'] } },
      ],
    })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

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

// Ultra-fast lightweight count query for customer navbar badge (replaces heavy polling)
export async function getMyBadgeCount(req, res, next) {
  try {
    const CustomOrderRequest = (await import('../models/CustomOrderRequest.js')).default;
    const [activeOrders, activeCustom] = await Promise.all([
      Order.countDocuments({
        user: req.user._id,
        status: { $nin: ['Delivered', 'Cancelled'] },
        $or: [
          { paymentScreenshot: { $exists: true, $nin: [null, ''] } },
          { paymentStatus: { $in: ['Paid', 'Pending Verification', 'Confirmed', 'Processing', 'Shipped'] } },
        ],
      }),
      CustomOrderRequest.countDocuments({
        user: req.user._id,
        $or: [
          { status: 'Accepted' },
          { 'messages.sender': 'admin' },
        ],
      }),
    ]);
    res.json({ count: activeOrders + activeCustom });
  } catch (err) {
    next(err);
  }
}

export async function getMyOrder(req, res, next) {
  try {
    const isUserAdmin = req.user && req.user.role === 'admin';
    const query = isUserAdmin ? { _id: req.params.id } : { _id: req.params.id, user: req.user._id };
    const order = await Order.findOne(query)
      .populate('user', 'name email')
      .populate('customOrderId', 'referenceImage referenceImages sampleImage description productType');
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
    // Only show orders in Admin that have uploaded payment screenshots or verified payments
    const orders = await Order.find({
      $or: [
        { paymentScreenshot: { $exists: true, $nin: [null, ''] } },
        { paymentStatus: { $in: ['Paid', 'Pending Verification', 'Confirmed', 'Processing', 'Shipped', 'Delivered'] } },
      ],
    })
      .populate('user', 'name email')
      .populate('customOrderId', 'referenceImage referenceImages sampleImage description productType')
      .sort({ createdAt: -1 });

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
    if (!req.file) {
      throw new AppError('No payment screenshot file uploaded. Please select an image.', 400);
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      throw new AppError('Order not found. Please refresh and try again.', 404);
    }

    // Check order belongs to user (or admin)
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      throw new AppError('Not authorized.', 403);
    }

    // Save the screenshot path to the order
    order.paymentScreenshot = `/uploads/${req.file.filename}`;
    order.paymentStatus = 'Pending Verification';
    await order.save();

    // Persist to MongoDB Atlas so screenshot is preserved across server restarts
    try {
      await persistUploadedFile(req.file, 'Order', order._id);
    } catch (persistErr) {
      console.error('[uploadPaymentScreenshot] File persistence warning:', persistErr);
    }

    // Send push notification to admin about payment screenshot upload
    try {
      notifyPaymentScreenshot(order).catch(err => console.error('[notification] Failed to send payment notification:', err));
    } catch (notifErr) {
      console.error('[uploadPaymentScreenshot] Notification warning:', notifErr);
    }

    // If this is a custom order, link it to the custom order request NOW that payment screenshot is uploaded!
    if (order.isCustomOrder && order.customOrderId) {
      try {
        const CustomOrderRequest = (await import('../models/CustomOrderRequest.js')).default;
        await CustomOrderRequest.findByIdAndUpdate(order.customOrderId, { linkedOrderId: order._id });
      } catch (e) {
        console.error('Failed to link custom order on screenshot upload', e);
      }
    }

    const orderObj = order.toObject();
    orderObj.id = orderObj._id;
    delete orderObj._id;
    delete orderObj.__v;

    res.json({ order: orderObj, message: 'Screenshot uploaded successfully' });
  } catch (err) {
    next(err);
  }
}

// Delete payment screenshot to free storage space
export async function deletePaymentScreenshot(req, res, next) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      throw new AppError('Not authorized.', 403);
    }

    if (order.paymentScreenshot) {
      await removeUploadedFile(order.paymentScreenshot);
      order.paymentScreenshot = null;
      if (order.paymentStatus === 'Pending Verification') {
        order.paymentStatus = 'Pending';
      }
      await order.save();
    }

    const orderObj = order.toObject();
    orderObj.id = orderObj._id;
    delete orderObj._id;
    delete orderObj.__v;

    res.json({ order: orderObj, message: 'Payment screenshot deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// Admin: delete order & associated files
export async function deleteOrder(req, res, next) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) throw new AppError('Order not found.', 404);

    if (order.paymentScreenshot) {
      await removeUploadedFile(order.paymentScreenshot);
    }
    await UploadedFile.deleteMany({ relatedId: order._id }).catch(() => {});

    await Order.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
