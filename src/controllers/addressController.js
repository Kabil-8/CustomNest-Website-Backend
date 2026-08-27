import { z } from 'zod';
import Address from '../models/Address.js';
import { AppError } from '../middleware/errorHandler.js';

const addressInput = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(6),
  line1: z.string().min(3),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(3),
  country: z.string().min(1),
  isDefault: z.boolean().optional(),
});

export async function listAddresses(req, res, next) {
  try {
    const addresses = await Address.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ addresses });
  } catch (err) {
    next(err);
  }
}

export async function createAddress(req, res, next) {
  try {
    const input = addressInput.parse(req.body);
    if (input.isDefault) {
      await Address.updateMany({ user: req.user._id }, { isDefault: false });
    }
    const address = await Address.create({ ...input, user: req.user._id });
    res.status(201).json({ address });
  } catch (err) {
    next(err);
  }
}

export async function deleteAddress(req, res, next) {
  try {
    const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!address) throw new AppError('Address not found.', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
