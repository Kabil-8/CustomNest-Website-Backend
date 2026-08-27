import Cart from '../models/Cart.js';

export async function getCart(req, res, next) {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    res.json({ items: cart?.items ?? [] });
  } catch (err) {
    next(err);
  }
}

export async function addToCart(req, res, next) {
  try {
    const { productId, quantity = 1, customization } = req.body;
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });

    const existing = cart.items.find(
      (i) => i.product.toString() === productId && JSON.stringify(i.customization ?? {}) === JSON.stringify(customization ?? {})
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.items.push({ product: productId, quantity, customization });
    }
    await cart.save();
    await cart.populate('items.product');
    res.json({ items: cart.items });
  } catch (err) {
    next(err);
  }
}

export async function updateCartItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.json({ items: [] });

    if (quantity <= 0) {
      cart.items = cart.items.filter((i) => i._id.toString() !== itemId);
    } else {
      const item = cart.items.id(itemId);
      if (item) item.quantity = quantity;
    }
    await cart.save();
    await cart.populate('items.product');
    res.json({ items: cart.items });
  } catch (err) {
    next(err);
  }
}

export async function clearCart(req, res, next) {
  try {
    await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
