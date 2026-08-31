import { z } from 'zod';
import CustomOrderRequest from '../models/CustomOrderRequest.js';
import Order from '../models/Order.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendWhatsAppNotification, buildCustomOrderMessage, buildCustomOrderAcceptedMessage } from '../utils/whatsapp.js';

const requestSchema = z.object({
  name:           z.string().min(2),
  email:          z.string().email(),
  phone:          z.string().min(6),
  productType:    z.string().min(2),
  colors:         z.string().optional().nullable(),
  yarnType:       z.string().optional().nullable(),
  size:           z.string().optional().nullable(),
  quantity:       z.coerce.number().int().min(1).default(1),
  budget:         z.string().optional().nullable(),
  deadline:       z.string().optional().nullable(),
  description:    z.string().min(10),
  referenceImage: z.string().optional().nullable(),
});

// ── Submit (customer, logged in) ──────────────────────────────────────────────
export async function submitCustomOrder(req, res, next) {
  try {
    const input = requestSchema.parse(req.body);
    if (input.email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(400).json({ message: 'The email address must match your account email.' });
    }
    const referenceImage = req.file ? `/uploads/${req.file.filename}` : (input.referenceImage || undefined);
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
    const requests = await CustomOrderRequest.find()
      .populate('linkedOrderId', 'paymentScreenshot paymentStatus orderNumber total')
      .sort({ createdAt: -1 });

    const requestsWithId = requests.map(reqItem => {
      const obj = reqItem.toObject();
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
    const requests = await CustomOrderRequest.find({ user: req.user._id })
      .populate('linkedOrderId', 'paymentScreenshot paymentStatus orderNumber total')
      .sort({ createdAt: -1 });

    const requestsWithId = requests.map(reqItem => {
      const obj = reqItem.toObject();
      obj.id = obj._id;
      delete obj._id;
      delete obj.__v;

      // If linkedOrderId has no payment screenshot and is pending, treat as not finalized yet
      if (obj.linkedOrderId && typeof obj.linkedOrderId === 'object') {
        const ord = obj.linkedOrderId;
        if (!ord.paymentScreenshot && ord.paymentStatus === 'Pending') {
          obj.linkedOrderId = null;
        }
      }
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
    if (agreedPrice !== undefined) {
      updateData.agreedPrice = agreedPrice;
    }

    const request = await CustomOrderRequest.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    if (!request) throw new AppError('Custom order request not found.', 404);

    if (status === 'Accepted' && request.agreedPrice) {
      sendWhatsAppNotification(buildCustomOrderAcceptedMessage(request, request.agreedPrice)).catch(() => {});
    }
    
    // Ensure proper ID mapping for frontend
    const obj = request.toObject();
    obj.id = obj._id;
    delete obj._id;
    delete obj.__v;
    
    res.json({ request: obj });
  } catch (err) { next(err); }
}

// ── Admin: reply / send message in thread ─────────────────────────────────────
export async function adminSendMessage(req, res, next) {
  try {
    const { text, status } = z.object({
      text:   z.string().min(1),
      status: z.enum(['New', 'In Review', 'Quoted', 'Accepted', 'Declined']).optional(),
    }).parse(req.body);

    const update = {
      $push: { messages: { sender: 'admin', text } },
    };
    if (status) update.status = status;

    const request = await CustomOrderRequest.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    if (!request) throw new AppError('Custom order request not found.', 404);
    
    // Ensure proper ID mapping for frontend
    const obj = request.toObject();
    obj.id = obj._id;
    delete obj._id;
    delete obj.__v;
    
    res.json({ request: obj });
  } catch (err) { next(err); }
}

// ── Customer: reply / send message in thread ──────────────────────────────────
export async function customerSendMessage(req, res, next) {
  try {
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body);

    const request = await CustomOrderRequest.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $push: { messages: { sender: 'customer', text } } },
      { new: true }
    );
    if (!request) throw new AppError('Custom order request not found.', 404);
    
    // Ensure proper ID mapping for frontend
    const obj = request.toObject();
    obj.id = obj._id;
    delete obj._id;
    delete obj.__v;
    
    res.json({ request: obj });
  } catch (err) { next(err); }
}

// ── Customer: Checkout custom order ──────────────────────────────────────────
// Called when the customer clicks "Proceed to Payment" from their account.
// Creates or updates a pending Order with custom details without prematurely marking custom order as paid.
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
    const quantity = customReq.quantity ?? 1;
    const shipping = 50 * quantity;
    const subtotal = customReq.agreedPrice;
    const total = subtotal + shipping;

    // Check if there is already an existing pending order for this custom request
    let order = await Order.findOne({
      customOrderId: customReq._id,
      paymentScreenshot: { $exists: false },
    });

    if (order) {
      order.address = address;
      order.subtotal = subtotal;
      order.shipping = shipping;
      order.total = total;
      order.items = [{
        product:  null,
        name:     `Custom: ${customReq.productType}`,
        image:    customReq.referenceImage || '/images/products/amigurumi-bunny.jpg',
        price:    subtotal,
        quantity: quantity,
        customization: {
          color:            customReq.colors || '',
          size:             customReq.size   || '',
          yarnType:         customReq.yarnType || '',
          specialRequest:   customReq.description,
        },
      }];
      await order.save();
    } else {
      order = await Order.create({
        orderNumber,
        user:     req.user._id,
        address,
        items: [{
          product:  null,
          name:     `Custom: ${customReq.productType}`,
          image:    customReq.referenceImage || '/images/products/amigurumi-bunny.jpg',
          price:    subtotal,
          quantity: quantity,
          customization: {
            color:            customReq.colors || '',
            size:             customReq.size   || '',
            yarnType:         customReq.yarnType || '',
            specialRequest:   customReq.description,
          },
        }],
        subtotal:      subtotal,
        shipping:      shipping,
        discount:      0,
        total:         total,
        paymentMethod: 'upi-qr',
        paymentStatus: 'Pending',
        isCustomOrder: true,
        customOrderId: customReq._id,
      });
    }

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

// ── Admin: delete custom order ────────────────────────────────────────────────
export async function deleteCustomOrder(req, res, next) {
  try {
    const request = await CustomOrderRequest.findByIdAndDelete(req.params.id);
    if (!request) throw new AppError('Custom order request not found.', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
