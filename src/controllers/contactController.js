import ContactMessage from '../models/ContactMessage.js';
import { AppError } from '../middleware/errorHandler.js';

// Public: Submit a message from the Contact page
export async function createMessage(req, res, next) {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      throw new AppError('Name, email, and message are required.', 400);
    }

    const contactMessage = await ContactMessage.create({
      name,
      email,
      subject: subject || '',
      message,
    });

    res.status(201).json({ contactMessage });
  } catch (err) {
    next(err);
  }
}

// Admin: List all contact inquiries
export async function listMessages(req, res, next) {
  try {
    const { status, q } = req.query;
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (q) {
      const regex = new RegExp(String(q), 'i');
      filter.$or = [{ name: regex }, { email: regex }, { subject: regex }, { message: regex }];
    }

    const messages = await ContactMessage.find(filter).sort({ createdAt: -1 });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

// Admin: Update message status (e.g. Read, Replied, Unread)
export async function updateMessageStatus(req, res, next) {
  try {
    const { status } = req.body;
    const message = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!message) throw new AppError('Message not found.', 404);
    res.json({ message });
  } catch (err) {
    next(err);
  }
}

// Admin: Delete a contact message
export async function deleteMessage(req, res, next) {
  try {
    const message = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!message) throw new AppError('Message not found.', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
