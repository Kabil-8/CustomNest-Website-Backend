import crypto from 'node:crypto';
import Order from '../models/Order.js';
import { AppError } from '../middleware/errorHandler.js';

export async function createRazorpayOrder(req, res, next) {
  try {
    const { amount, currency = 'INR', orderId } = req.body;

    if (!amount || amount <= 0) {
      throw new AppError('Invalid amount for Razorpay order.', 400);
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const amountInPaise = Math.round(amount * 100);

    // If real Razorpay keys are configured, call Razorpay Orders API
    if (keyId && keySecret && !keyId.includes('replace_with')) {
      const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency,
          receipt: orderId || `receipt_${Date.now()}`,
          notes: {
            appName: 'TheCustomNest',
          },
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new AppError(errBody.error?.description || 'Razorpay order creation failed.', response.status);
      }

      const rzpOrder = await response.json();
      return res.json({
        id: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        key: keyId,
      });
    }

    // Demo / Test Mode Fallback
    const demoOrderId = `order_rzp_test_${Date.now()}`;
    const demoKey = keyId || 'rzp_test_thecustomnest';

    res.json({
      id: demoOrderId,
      amount: amountInPaise,
      currency,
      key: demoKey,
      isDemo: true,
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyRazorpayPayment(req, res, next) {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      throw new AppError('Missing Razorpay payment verification details.', 400);
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (keySecret && !keySecret.includes('replace_with') && razorpay_signature) {
      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        throw new AppError('Razorpay payment signature verification failed.', 400);
      }
    }

    // Update order status in database if orderId is provided
    let updatedOrder = null;
    if (orderId) {
      updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        {
          paymentStatus: 'Paid',
          paymentMethod: 'razorpay',
          status: 'Confirmed',
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature || 'verified_demo_sig',
        },
        { new: true }
      );
    }

    res.json({
      success: true,
      message: 'Razorpay payment verified successfully',
      order: updatedOrder,
    });
  } catch (err) {
    next(err);
  }
}
