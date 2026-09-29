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
      isAddon,
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

    // Addon products filter
    if (isAddon === '1' || isAddon === 'true') {
      const addonCats = await Category.find({
        $or: [{ slug: /^add-?ons?$/i }, { name: /add-?on/i }]
      }).distinct('_id');
      filter.$or = [
        { isAddon: true },
        { category: { $in: addonCats } },
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

        // Known aliases for kids special / jumbo toys category
        if (['kids-special', 'kids-toys-jumbo', 'jumbo-kids-toys', 'kids-toys'].includes(raw.toLowerCase())) {
          slugPatterns.push(/^kids-special$/i, /^kids-toys-jumbo$/i, /^jumbo-kids-toys$/i);
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
  const raw = String(catInput).trim();
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const slugPatterns = [new RegExp(`^${escaped}$`, 'i')];

  if (['kids-special', 'kids-toys-jumbo', 'jumbo-kids-toys'].includes(raw.toLowerCase())) {
    slugPatterns.push(/^kids-special$/i, /^kids-toys-jumbo$/i);
  }
  if (['resin-frames', 'resin-photo-frames', 'resin-memory-frames'].includes(raw.toLowerCase())) {
    slugPatterns.push(/^resin-frames$/i, /^resin-photo-frames$/i);
  }

  const catDoc = await Category.findOne({
    $or: [
      { slug: { $in: slugPatterns } },
      { name: new RegExp(escaped, 'i') },
    ],
  });
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
    if (data.isAddon) {
      data.shippingCharge = 0;
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
    if (data.isAddon) {
      data.shippingCharge = 0;
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
    const rawCategories = await Category.find().sort({ name: 1 });
    const productCounts = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = new Map();
    productCounts.forEach((p) => countMap.set(String(p._id), p.count));

    const categories = rawCategories.map((c) => {
      const obj = c.toObject();
      if (obj.slug === 'kids-toys-jumbo' || /jumbo kids/i.test(obj.name)) {
        obj.name = 'Kids Special';
        obj.slug = 'kids-special';
      }
      if (obj.slug === 'resin-photo-frames' || /^resin\s*photo\s*frames?$/i.test(obj.name)) {
        obj.name = 'Resin Photo Frames';
        obj.slug = 'resin-frames';
      }
      obj.productCount = countMap.get(String(obj._id)) || 0;
      return obj;
    });
    res.json({ categories });
  } catch (err) {
    next(err);
  }
}

export async function createCategory(req, res, next) {
  try {
    const { name, slug, collection, image } = req.body;
    if (!name || !name.trim()) throw new AppError('Category name is required.', 400);

    const safeSlug = (slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    const existing = await Category.findOne({ slug: safeSlug });
    if (existing) throw new AppError(`Category with slug "${safeSlug}" already exists.`, 400);

    const category = await Category.create({
      name: name.trim(),
      slug: safeSlug,
      collection: collection?.trim() || safeSlug,
      image: image?.trim() || '/images/categories/jumbo-flower-bouquets.jpg',
    });

    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
}

export async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const { name, slug, collection, image } = req.body;

    const category = await Category.findById(id);
    if (!category) throw new AppError('Category not found.', 404);

    if (name && name.trim()) category.name = name.trim();
    if (slug && slug.trim()) {
      const safeSlug = slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      if (safeSlug !== category.slug) {
        const existing = await Category.findOne({ slug: safeSlug, _id: { $ne: id } });
        if (existing) throw new AppError(`Category slug "${safeSlug}" is already in use.`, 400);
        category.slug = safeSlug;
      }
    }
    if (collection !== undefined) category.collection = collection.trim() || category.slug;
    if (image !== undefined) category.image = image.trim();

    await category.save();
    res.json({ category });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) throw new AppError('Category not found.', 404);

    const productCount = await Product.countDocuments({ category: id });
    if (productCount > 0) {
      throw new AppError(
        `Cannot delete category "${category.name}". It is currently assigned to ${productCount} active product(s). Please reassign those products first.`,
        400
      );
    }

    await Category.findByIdAndDelete(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

