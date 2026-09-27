import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import { AppError } from '../middleware/errorHandler.js';

export async function listProducts(req, res, next) {
  try {
    const {
      q,
      category,
      collection,
      maxPrice,
      customizable,
      inStock,
      inStockOnly,
      minRating,
      home,
      sort = 'featured',
      page = 1,
      limit = 12,
    } = req.query;
    const filter = {};

    if (q) filter.$text = { $search: String(q) };
    if (maxPrice) filter.price = { $lte: Number(maxPrice) };
    if (customizable === '1' || customizable === 'true') filter.customizable = true;

    // In stock filter
    if (inStock === '1' || inStock === 'true' || inStockOnly === '1' || inStockOnly === 'true') {
      filter.stock = { $gt: 0 };
    }

    // Min rating filter
    if (minRating && Number(minRating) > 0) {
      filter.rating = { $gte: Number(minRating) };
    }

    if (home === '1' || home === 'true') {
      filter.$or = [
        { featuredRank: { $gt: 0, $lte: 10 } },
        { showOnHome: true },
      ];
    }

    if (category || collection) {
      const orConditions = [];

      if (category) {
        const raw = String(category).trim();
        const isMongoId = mongoose.Types.ObjectId.isValid(raw);
        const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const slugPatterns = [new RegExp(`^${escaped}$`, 'i')];

        // Known aliases for resin photo frames category
        if (['resin-frames', 'resin-photo-frames', 'resin-memory-frames', 'resin-art'].includes(raw.toLowerCase())) {
          slugPatterns.push(/^resin-frames$/i, /^resin-photo-frames$/i, /^resin-memory-frames$/i, /^resin-art$/i);
        }

        const catQuery = {
          $or: [
            { slug: { $in: slugPatterns } },
            { name: new RegExp(escaped, 'i') },
            ...(isMongoId ? [{ _id: raw }] : []),
          ],
        };
        if (collection) {
          catQuery.collection = new RegExp(`^${String(collection).trim()}$`, 'i');
        }
        orConditions.push(catQuery);
      } else if (collection) {
        orConditions.push({
          collection: new RegExp(`^${String(collection).trim()}$`, 'i'),
        });
      }

      const foundCats = await Category.find({ $or: orConditions }).distinct('_id');
      if (foundCats.length > 0) {
        filter.category = { $in: foundCats };
      } else if (category && mongoose.Types.ObjectId.isValid(category)) {
        filter.category = category;
      } else {
        filter.category = { $in: [] };
      }
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(500, Math.max(1, Number(limit)));

    const total = await Product.countDocuments(filter);

    let items;
    if (!sort || sort === 'featured') {
      // Use aggregation with sortRank so 1..10 come FIRST in order, then featured: -1, createdAt: -1
      const pipeline = [
        ...(Object.keys(filter).length ? [{ $match: filter }] : []),
        {
          $addFields: {
            sortRank: {
              $cond: [
                { $and: [{ $gt: ['$featuredRank', 0] }, { $lte: ['$featuredRank', 10] }] },
                '$featuredRank',
                99999
              ]
            }
          }
        },
        { $sort: { sortRank: 1, featured: -1, createdAt: -1 } },
        { $skip: (pageNum - 1) * limitNum },
        { $limit: limitNum },
        {
          $lookup: {
            from: 'categories',
            localField: 'category',
            foreignField: '_id',
            as: 'category'
          }
        },
        {
          $unwind: {
            path: '$category',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $lookup: {
            from: 'colors',
            localField: 'availableColors',
            foreignField: '_id',
            as: 'availableColors'
          }
        }
      ];

      items = await Product.aggregate(pipeline);
    } else {
      const sortMap = {
        newest: { isNew: -1, createdAt: -1 },
        'price-asc': { price: 1 },
        'price-desc': { price: -1 },
        popular: { reviewCount: -1 },
        rating: { rating: -1 },
      };

      items = await Product.find(filter)
        .populate('category', 'name slug collection')
        .populate('availableColors', 'name hexCode isActive')
        .sort(sortMap[sort] || { createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);
    }

    res.json({ items, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    next(err);
  }
}

export async function getProductBySlug(req, res, next) {
  try {
    const param = req.params.slug;
    const isMongoId = mongoose.Types.ObjectId.isValid(param);
    const product = await Product.findOne({
      $or: [{ slug: param }, ...(isMongoId ? [{ _id: param }] : [])],
    })
      .populate('category', 'name slug collection')
      .populate('availableColors', 'name hexCode isActive');

    if (!product) throw new AppError('Product not found.', 404, 'PRODUCT_NOT_FOUND');
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

async function resolveCategoryId(catInput) {
  if (!catInput) return null;
  if (mongoose.Types.ObjectId.isValid(catInput)) {
    return catInput;
  }
  const catDoc = await Category.findOne({ slug: catInput });
  return catDoc ? catDoc._id : catInput;
}

export async function createProduct(req, res, next) {
  try {
    const data = { ...req.body };
    if (data.category) {
      data.category = await resolveCategoryId(data.category);
    }
    if (data.yarnType === 'normal' && data.normalPrice !== undefined && data.normalPrice !== null) {
      data.price = Number(data.normalPrice);
    } else if (data.yarnType === 'acrylic' && data.acrylicPrice !== undefined && data.acrylicPrice !== null) {
      data.price = Number(data.acrylicPrice);
    } else if (data.yarnType === 'both') {
      if (data.normalPrice !== undefined && data.normalPrice !== null && (!data.price || data.price === 0)) {
        data.price = Number(data.normalPrice);
      }
    }
    const created = await Product.create(data);
    const product = await Product.findById(created._id)
      .populate('category', 'name slug collection')
      .populate('availableColors', 'name hexCode isActive');
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
}

export async function updateProduct(req, res, next) {
  try {
    const data = { ...req.body };
    if (data.category) {
      data.category = await resolveCategoryId(data.category);
    }
    if (data.yarnType === 'normal' && data.normalPrice !== undefined && data.normalPrice !== null) {
      data.price = Number(data.normalPrice);
    } else if (data.yarnType === 'acrylic' && data.acrylicPrice !== undefined && data.acrylicPrice !== null) {
      data.price = Number(data.acrylicPrice);
    } else if (data.yarnType === 'both') {
      if (data.normalPrice !== undefined && data.normalPrice !== null && (!data.price || data.price === 0)) {
        data.price = Number(data.normalPrice);
      }
    }
    const product = await Product.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true })
      .populate('category', 'name slug collection')
      .populate('availableColors', 'name hexCode isActive');

    if (!product) throw new AppError('Product not found.', 404);
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

export async function deleteProduct(req, res, next) {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) throw new AppError('Product not found.', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listCategories(_req, res, next) {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json({ categories });
  } catch (err) {
    next(err);
  }
}
