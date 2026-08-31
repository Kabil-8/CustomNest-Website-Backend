import { z } from 'zod';
import Color from '../models/Color.js';
import { AppError } from '../middleware/errorHandler.js';

const colorSchema = z.object({
  name: z.string().min(1, 'Color name is required'),
  hexCode: z.string().min(1, 'Hex code is required'),
  image: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

// Public: List active colors (for customer product customization)
export async function listActiveColors(_req, res, next) {
  try {
    const colors = await Color.find({ isActive: true }).sort({ name: 1 });
    res.json({ colors });
  } catch (err) {
    next(err);
  }
}

export async function listColors(_req, res, next) {
  try {
    const colors = await Color.find().sort({ name: 1 });
    res.json({ colors });
  } catch (err) {
    next(err);
  }
}

export async function createColor(req, res, next) {
  try {
    const input = colorSchema.parse(req.body);
    const color = await Color.create(input);
    res.status(201).json({ color });
  } catch (err) {
    next(err);
  }
}

export async function updateColor(req, res, next) {
  try {
    const { id } = req.params;
    const input = colorSchema.partial().parse(req.body);
    const color = await Color.findByIdAndUpdate(id, input, { new: true });
    if (!color) throw new AppError('Color not found.', 404);
    res.json({ color });
  } catch (err) {
    next(err);
  }
}

export async function deleteColor(req, res, next) {
  try {
    const { id } = req.params;
    const color = await Color.findByIdAndDelete(id);
    if (!color) throw new AppError('Color not found.', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}