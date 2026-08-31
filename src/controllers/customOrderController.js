import { z } from 'zod';
import CustomOrderRequest from '../models/CustomOrderRequest.js';
import Order from '../models/Order.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendWhatsAppNotification, buildCustomOrderMessage, buildCustomOrderAcceptedMessage } from '../utils/whatsapp.js';

const requestSchema = z.object({
  name:        z.string().min(2),
  email:       z.string().email(),
  phone:       z.string().min(6),
  productType: z.string().min(2),
  colors:      z.string().optional(),
  size:        z.string().optional(),
  quantity:    z.number().int().min(1).default(1),
  budget:      z.string().optional(),
  deadline:    z.string().optional(),
  description: z.string().min(10),
});

// ── Submit (customer, logged in) ──────────────────────────────────────────────
export async function submitCustomOrder(req, res, next) {
  try {
    const input = requestSchema.parse(req.body);
    if (input.email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(400).json({ message: 'The email address must match your account email.' });
    }
    const referenceImage = req.file ? `/uploads/${req.file.filename}` : undefined;
    const request = await CustomOrderRequest.create({
      ...input,
      referenceImage,
      user: req.user._id,
      messages: [{ sender: 'customer', text: input.description }],
    });
    sendWhatsAppNotification(buildCustomOrderMessage(request)).catch(() => {});
    
    // Ensure proper ID mapping for frontend
    const obj = request.toObject();
    obj.id = obj._id;
    delete obj._id;
    delete obj.__v;
    
    res.status(201).json({ request: obj });
  } catch (err) { next(err); }
}

// ── Admin: list all ───────────────────────────────────────────────────────────
export async function listCustomOrders(_req, res, next) {
  try {
    const requests = await CustomOrderRequest.find().sort({ createdAt: -1 });
    // Ensure proper ID mapping for frontend
    const requestsWithId = requests.map(req => {
      const obj = req.toObject();
      obj.id = obj._id;
      delete obj._id;
      delete obj.__v;
      return obj;
    });
    res.json({ requests: requestsWithId });
  } catch (err) { next(err); }
}

// ── Customer: list mine ───────────────────────────────────────────────────────
export async function listMyCustomOrders(req, res, next) {
  try {
    const requests = await CustomOrderRequest.find({ user: req.user._id }).sort({ createdAt: -1 });
    // Ensure proper ID mapping for frontend
    const requestsWithId = requests.map(req => {
      const obj = req.toObject();
      obj.id = obj._id;
      delete obj._id;
      delete obj.__v;
      return obj;
    });
    res.json({ requests: requestsWithId });
  } catch (err) { next(err); }
}

// ── Admin: update status only ─────────────────────────────────────────────────
export async function updateCustomOrderStatus(req, res, next) {
  try {
    const { status, agreedPrice } = z
      .object({
        status: z.enum(['New', 'In Review', 'Quoted', 'Accepted', 'Declined']),
        agreedPrice: z.number().min(0).optional(),
      })
      .parse(req.body);

    const updateData = { status };
    if (agreedPrice !== undefined) updateData.agreedPrice = agreedPrice;

    const request = await CustomOrderRequest.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    if (!request) throw new AppError('Request not found.', 404);

    if (status === 'Accepted' && request.agreedPrice) {
      const acceptedMessage = buildCustomOrderAcceptedMessage(request);
      sendWhatsAppNotification(acceptedMessage).catch(() => {});
    }
    
    // Ensure proper ID mapping for frontend
    const obj = request.toObject();
    obj.id = obj._id;
    delete obj._id;
    delete obj.__v;
    
    res.json({ request: obj });
  } catch (err) { next(err); }
}

// ── Admin: send message (automatically updates status + optionally set agreedPrice) ──
export async function adminSendMessage(req, res, next) {
  try {
    const { text, status, agreedPrice } = z.object({
      text:        z.string().min(1, 'Message cannot be empty.'),
      status:      z.enum(['New', 'In Review', 'Quoted', 'Accepted', 'Declined']).optional(),
      agreedPrice: z.number().min(0).optional(),
    }).parse(req.body);

    const $set = {};
    // AUTO-UPDATE: When admin sends a message, automatically update status to "In Review"
    // unless a specific status is being set
    if (status) {
      $set.status = status;
    } else {
      // Get current status first to avoid overriding already advanced statuses
      const currentRequest = await CustomOrderRequest.findById(req.params.id);
      if (currentRequest && currentRequest.status === 'New') {
        $set.status = 'In Review';
      }
    }
    
    if (agreedPrice !== undefined) $set.agreedPrice = agreedPrice;

    const update = { $push: { messages: { sender: 'admin', text } } };
    if (Object.keys($set).length) update.$set = $set;

    const request = await CustomOrderRequest.findByIdAndUpdate(
      req.params.id, update, { new: true }
    );
    if (!request) throw new AppError('Request not found.', 404);
    
    // Send notification when order is accepted
    if (status === 'Accepted' && request.agreedPrice) {
      const acceptedMessage = buildCustomOrderAcceptedMessage(request);
      sendWhatsAppNotification(acceptedMessage).catch(() => {});
    }
    
    // Ensure proper ID mapping for frontend
    const obj = request.toObject();
    obj.id = obj._id;
    delete obj._id;
    delete obj.__v;
    
    res.json({ request: obj });
  } catch (err) { next(err); }
}

// ── Customer: send follow-up message ─────────────────────────────────────────
export async function customerSendMessage(req, res, next) {
  try {
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body);
    const request = await CustomOrderRequest.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $push: { messages: { sender: 'customer', text } } },
      { new: true }
    );
    if (!request) throw new AppError('Request not found.', 404);
    
    // Ensure proper ID mapping for frontend
    const obj = request.toObject();
    obj.id = obj._id;
    delete obj._id;
    delete obj.__v;
    
    res.json({ request: obj });
  } catch (err) { next(err); }
}

// ── Customer: create a real Order from an accepted custom request ─────────────
// Called when the customer clicks "Proceed to Payment" from their account.
// Creates an Order with a virtual item (no product catalogue reference).
export async function createOrderFromCustomRequest(req, res, next) {
  try {
    const customReq = await CustomOrderRequest.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!customReq) throw new AppError('Custom order request not found.', 404);
    if (customReq.status !== 'Accepted') {
      return res.status(400).json({ message: 'This custom order has not been accepted yet.' });
    }
    if (!customReq.agreedPrice) {
      return res.status(400).json({ message: 'No agreed price set. Please wait for admin confirmation.' });
    }
    if (customReq.linkedOrderId) {
      // Already has an order — return it
      const existing = await Order.findById(customReq.linkedOrderId);
      if (existing) return res.json({ order: existing });
    }

    const { address } = z.object({
      address: z.object({
        fullName:   z.string().min(2),
        phone:      z.string().min(6),
        line1:      z.string().min(3),
        city:       z.string().min(1),
        state:      z.string().min(1),
        postalCode: z.string().min(3),
        country:    z.string().default('India'),
      }),
    }).parse(req.body);

    const orderNumber = `TCN-C${Math.floor(100000 + Math.random() * 900000)}`;
    const total = customReq.agreedPrice;

    const order = await Order.create({
      orderNumber,
      user:     req.user._id,
      address,
      items: [{
        product:  null,
        name:     `Custom: ${customReq.productType}`,
        image:    customReq.referenceImage || '/images/products/amigurumi-bunny.jpg',
        price:    total,
        quantity: customReq.quantity ?? 1,
        customization: {
          color:            customReq.colors || '',
          size:             customReq.size   || '',
          specialRequest:   customReq.description,
        },
      }],
      subtotal:      total,
      shipping:      0,
      discount:      0,
      total,
      paymentMethod: 'razorpay',
      paymentStatus: 'Pending',
      isCustomOrder: true,
      customOrderId: customReq._id,
    });

    // Link back on the custom request
    await CustomOrderRequest.findByIdAndUpdate(customReq._id, { linkedOrderId: order._id });

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
  } catch (err) { next(err); }
}
