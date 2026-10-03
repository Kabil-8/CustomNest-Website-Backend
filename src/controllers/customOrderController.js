import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import CustomOrderRequest from '../models/CustomOrderRequest.js';
import Order from '../models/Order.js';
import UploadedFile from '../models/UploadedFile.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendWhatsAppNotification, buildCustomOrderMessage, buildCustomOrderAcceptedMessage } from '../utils/whatsapp.js';
import { notifyNewCustomOrder } from '../services/notifications.js';

const uploadDir = path.resolve(process.cwd(), 'uploads');

// Persist uploaded file binary buffer & base64 to MongoDB Atlas
// Ensures images survive all Render container restarts and redeployments forever!
export async function persistUploadedFile(file, relatedModel, relatedId) {
  if (!file) return null;
  try {
    let data = null;
    if (file.path && fs.existsSync(file.path)) {
      data = await fs.promises.readFile(file.path);
    } else if (file.buffer) {
      data = file.buffer;
    }
    if (!data) return null;

    const mimeType = file.mimetype || 'image/jpeg';
    const base64 = `data:${mimeType};base64,${data.toString('base64')}`;

    await UploadedFile.findOneAndUpdate(
      { filename: file.filename },
      {
        filename: file.filename,
        originalName: file.originalname || file.filename,
        mimeType,
        size: file.size || data.length,
        data,
        base64,
        relatedModel,
        relatedId,
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error(`[persistUploadedFile] Error persisting ${file.filename} to MongoDB:`, err);
  }
}

// Remove file from MongoDB Atlas and local disk to free storage space
export async function removeUploadedFile(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return;
  try {
    const filename = path.basename(imagePath);
    // Delete from MongoDB Atlas
    await UploadedFile.deleteOne({ filename });

    // Delete from local disk if present
    const diskPath = path.join(uploadDir, filename);
    if (fs.existsSync(diskPath)) {
      await fs.promises.unlink(diskPath).catch(() => {});
    }
  } catch (err) {
    console.error(`[removeUploadedFile] Error deleting ${imagePath}:`, err);
  }
}

const requestSchema = z.object({
  name:           z.string().min(1),
  email:          z.string().email(),
  phone:          z.string().min(4),
  productType:    z.string().min(1),
  colors:         z.string().optional().nullable().transform((v) => v || ''),
  yarnType:       z.string().optional().nullable().transform((v) => v || ''),
  resinOption:    z.string().optional().nullable().transform((v) => v || ''),
  size:           z.string().optional().nullable().transform((v) => v || ''),
  quantity:       z.coerce.number().int().min(1).default(1),
  budget:         z.string().optional().nullable().transform((v) => v || ''),
  deadline:       z.string().optional().nullable().transform((v) => v || ''),
  description:    z.string().min(3),
  referenceImage: z.string().optional().nullable(),
  sampleImage:    z.string().optional().nullable(),
});

// ── Submit (customer, logged in) ──────────────────────────────────────────────
export async function submitCustomOrder(req, res, next) {
  try {
    const input = requestSchema.parse(req.body);

    const userEmail = req.user?.email ? req.user.email.trim().toLowerCase() : '';
    const inputEmail = input.email ? input.email.trim().toLowerCase() : '';

    // If customer logged in with phone and didn't have email stored, attach it to their profile
    if (req.user && !req.user.email && inputEmail) {
      req.user.email = inputEmail;
      await req.user.save().catch(() => {});
    }

    const finalEmail = userEmail || inputEmail;

    // req.files is a dict when using upload.fields()
    const files = req.files || {};
    const refFile1 = (Array.isArray(files.referenceImage) ? files.referenceImage[0] : null)
      || (Array.isArray(files.referenceImage1) ? files.referenceImage1[0] : null);
    const refFile2 = Array.isArray(files.referenceImage2) ? files.referenceImage2[0] : null;
    const refFile3 = Array.isArray(files.referenceImage3) ? files.referenceImage3[0] : null;
    const refFilesArray = Array.isArray(files.referenceImages) ? files.referenceImages : [];

    const allUploadedFileObjects = [];
    if (refFile1) allUploadedFileObjects.push(refFile1);
    if (refFile2) allUploadedFileObjects.push(refFile2);
    if (refFile3) allUploadedFileObjects.push(refFile3);
    for (const f of refFilesArray) {
      if (f && f.filename) allUploadedFileObjects.push(f);
    }
    const sampleFile = Array.isArray(files.sampleImage) ? files.sampleImage[0] : null;
    if (sampleFile) allUploadedFileObjects.push(sampleFile);

    const allRefImages = [];
    if (refFile1) allRefImages.push(`/uploads/${refFile1.filename}`);
    if (refFile2) allRefImages.push(`/uploads/${refFile2.filename}`);
    if (refFile3) allRefImages.push(`/uploads/${refFile3.filename}`);
    for (const f of refFilesArray) {
      if (f && f.filename) allRefImages.push(`/uploads/${f.filename}`);
    }

    const sampleImage = sampleFile
      ? `/uploads/${sampleFile.filename}`
      : (input.sampleImage || undefined);

    const referenceImage = allRefImages[0] || input.referenceImage || undefined;
    const referenceImages = allRefImages.length > 0 ? allRefImages : (referenceImage ? [referenceImage] : []);

    const request = await CustomOrderRequest.create({
      ...input,
      email: finalEmail,
      referenceImage,
      referenceImages,
      sampleImage,
      user: req.user._id,
      messages: [{ sender: 'customer', text: input.description }],
    });

    // Persist all uploaded files to MongoDB Atlas so they remain accessible forever
    await Promise.all(
      allUploadedFileObjects.map((fileObj) =>
        persistUploadedFile(fileObj, 'CustomOrderRequest', request._id)
      )
    );

    sendWhatsAppNotification(buildCustomOrderMessage(request)).catch(() => {});
    
    // Send push notification to admin about new custom order
    notifyNewCustomOrder(request).catch(err => console.error('[notification] Failed to send custom order notification:', err));
    
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
    const subtotal = customReq.agreedPrice;
    const shipping = subtotal > 799 ? 0 : 50 * quantity;
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

// ── Admin: delete a specific image from a custom order ──────────────────────
export async function deleteCustomOrderImage(req, res, next) {
  try {
    const { id, index } = req.params;
    const request = await CustomOrderRequest.findById(id);
    if (!request) throw new AppError('Custom order request not found.', 404);

    if (index === 'sample') {
      if (request.sampleImage) {
        await removeUploadedFile(request.sampleImage);
        request.sampleImage = null;
      }
    } else {
      const idx = parseInt(index, 10);
      if (isNaN(idx) || idx < 0) {
        throw new AppError('Invalid image index.', 400);
      }
      const refImages = Array.isArray(request.referenceImages) ? [...request.referenceImages] : [];
      if (idx < refImages.length) {
        const removedPath = refImages[idx];
        await removeUploadedFile(removedPath);
        refImages.splice(idx, 1);
        request.referenceImages = refImages;
        request.referenceImage = refImages[0] || null;
      } else if (idx === 0 && request.referenceImage) {
        await removeUploadedFile(request.referenceImage);
        request.referenceImage = null;
        request.referenceImages = [];
      }
    }

    await request.save();

    const obj = request.toObject();
    obj.id = obj._id;
    delete obj._id;
    delete obj.__v;

    res.json({ request: obj, message: 'Image deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// ── Admin: upload or replace an image for a custom order ─────────────────────
export async function adminUploadCustomOrderImage(req, res, next) {
  try {
    const { id } = req.params;
    const { slotIndex } = req.body; // '0', '1', '2', or 'sample'
    const request = await CustomOrderRequest.findById(id);
    if (!request) throw new AppError('Custom order request not found.', 404);

    if (!req.file) {
      throw new AppError('No image file provided for upload.', 400);
    }

    // Persist to MongoDB Atlas
    await persistUploadedFile(req.file, 'CustomOrderRequest', request._id);
    const newImagePath = `/uploads/${req.file.filename}`;

    if (slotIndex === 'sample') {
      if (request.sampleImage) {
        await removeUploadedFile(request.sampleImage);
      }
      request.sampleImage = newImagePath;
    } else {
      const idx = slotIndex !== undefined && !isNaN(Number(slotIndex)) ? Number(slotIndex) : null;
      let refImages = Array.isArray(request.referenceImages) ? [...request.referenceImages] : [];

      if (idx !== null && idx >= 0) {
        if (idx < refImages.length && refImages[idx]) {
          await removeUploadedFile(refImages[idx]);
        }
        while (refImages.length <= idx) {
          refImages.push('');
        }
        refImages[idx] = newImagePath;
      } else {
        refImages.push(newImagePath);
      }

      // Filter out any potential empty placeholders
      refImages = refImages.filter(Boolean);
      request.referenceImages = refImages;
      request.referenceImage = refImages[0] || newImagePath;
    }

    await request.save();

    const obj = request.toObject();
    obj.id = obj._id;
    delete obj._id;
    delete obj.__v;

    res.json({ request: obj, message: 'Image uploaded successfully' });
  } catch (err) {
    next(err);
  }
}

// ── Admin: delete custom order & all its files ────────────────────────────────
export async function deleteCustomOrder(req, res, next) {
  try {
    const request = await CustomOrderRequest.findById(req.params.id);
    if (!request) throw new AppError('Custom order request not found.', 404);

    // Collect all image paths to remove from disk & MongoDB Atlas
    const pathsToDelete = [];
    if (request.referenceImage) pathsToDelete.push(request.referenceImage);
    if (Array.isArray(request.referenceImages)) {
      pathsToDelete.push(...request.referenceImages);
    }
    if (request.sampleImage) pathsToDelete.push(request.sampleImage);

    // Delete all linked UploadedFile records from MongoDB Atlas
    await UploadedFile.deleteMany({
      $or: [
        { relatedId: request._id },
        { filename: { $in: pathsToDelete.map(p => path.basename(p)) } },
      ],
    }).catch(() => {});

    // Delete disk files
    for (const p of pathsToDelete) {
      await removeUploadedFile(p);
    }

    await CustomOrderRequest.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
