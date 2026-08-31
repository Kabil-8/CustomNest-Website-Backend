import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import { AppError } from '../middleware/errorHandler.js';

export async function listProducts(req, res, next) {
  try {
    const { q, category, collection, maxPrice, customizable, home, sort = 'featured', page = 1, limit = 12 } = req.query;
    const filter = {};

    if (q) filter.$text = { $search: String(q) };
    if (maxPrice) filter.price = { $lte: Number(maxPrice) };
    if (customizable === '1') filter.customizable = true;
    if (home === '1' || home === 'true') {
      filter.$or = [
        { featuredRank: { $gt: 0, $lte: 10 } },
        { showOnHome: true },
      ];
    }

    if (category || collection) {
      const catFilter = {};
      if (category) catFilter.slug = category;
      if (collection) catFilter.collection = collection;
      const categoryIds = await Category.find(catFilter).distinct('_id');
      filter.category = { $in: categoryIds };
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(48, Math.max(1, Number(limit)));

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
