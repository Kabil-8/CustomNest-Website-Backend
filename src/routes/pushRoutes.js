import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPublicKey, saveSubscription, removeSubscription } from '../services/pushNotification.js';

const router = express.Router();

// Get VAPID public key for frontend to use
router.get('/vapid-key', (_req, res) => {
  res.json({ publicKey: getPublicKey() });
});

// Subscribe to push notifications (admin only)
router.post('/subscribe', requireAuth, (req, res, next) => {
  try {
    // Only admins can subscribe
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { subscription } = req.body;
    
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ message: 'Valid subscription object required' });
    }

    saveSubscription(req.user._id.toString(), subscription);
    
    res.json({ message: 'Subscription saved successfully' });
  } catch (err) {
    next(err);
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', requireAuth, (req, res, next) => {
  try {
    removeSubscription(req.user._id.toString());
    res.json({ message: 'Unsubscribed successfully' });
  } catch (err) {
    next(err);
  }
});

// Test notification (for debugging)
router.post('/test', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { sendNotification } = await import('../services/pushNotification.js');
    
    const result = await sendNotification(req.user._id.toString(), {
      title: '🔔 Test Notification',
      body: 'Push notifications are working!',
      tag: 'test-notification'
    });

    res.json({ success: result, message: result ? 'Test notification sent' : 'No subscription found' });
  } catch (err) {
    next(err);
  }
});

export default router;