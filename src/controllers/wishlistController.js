import Wishlist from '../models/Wishlist.js';

export async function getWishlist(req, res, next) {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id }).populate('products');
    res.json({ products: wishlist?.products ?? [] });
  } catch (err) {
    next(err);
  }
}

export async function toggleWishlist(req, res, next) {
  try {
    const { productId } = req.params;
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) wishlist = await Wishlist.create({ user: req.user._id, products: [] });

    const exists = wishlist.products.some((p) => p.toString() === productId);
    if (exists) {
      wishlist.products = wishlist.products.filter((p) => p.toString() !== productId);
    } else {
      wishlist.products.push(productId);
    }
    await wishlist.save();
    res.json({ products: wishlist.products, saved: !exists });
  } catch (err) {
    next(err);
  }
}
