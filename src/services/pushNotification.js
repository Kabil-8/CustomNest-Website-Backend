import webpush from 'web-push';

// Generate VAPID keys once and reuse them
// Run: node -e "const webpush = require('web-push'); console.log(JSON.stringify(webpress.generateVAPIDKeys()));" 
// Or use the init function below to generate and log them

let vapidKeys = null;

// Initialize VAPID keys - only generate once
function getVapidKeys() {
  if (!vapidKeys) {
    vapidKeys = {
      publicKey: process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
      privateKey: process.env.VAPID_PRIVATE_KEY || 'UUxI4O8-FbRouAf7-7OTt9GH4o-1Vj2F6bC1YnS5qYc'
    };
  }
  return vapidKeys;
}

// Configure web-push
webpush.setVapidDetails(
  'mailto:admin@thecustomnest.com',
  getVapidKeys().publicKey,
  getVapidKeys().privateKey
);

// In-memory store for subscriptions (in production, use database)
const subscriptions = new Map();

/**
 * Get the VAPID public key for the frontend
 */
export function getPublicKey() {
  return getVapidKeys().publicKey;
}

/**
 * Save a push subscription for admin
 * @param {string} adminId - Admin user ID
 * @param {Object} subscription - Push subscription object from the browser
 */
export function saveSubscription(adminId, subscription) {
  subscriptions.set(adminId, subscription);
  console.log(`[push] Subscription saved for admin ${adminId}`);
}

/**
 * Remove a push subscription
 * @param {string} adminId - Admin user ID
 */
export function removeSubscription(adminId) {
  subscriptions.delete(adminId);
  console.log(`[push] Subscription removed for admin ${adminId}`);
}

/**
 * Send push notification to admin
 * @param {string} adminId - Admin user ID
 * @param {Object} payload - Notification payload { title, body, icon, tag, data }
 */
export async function sendNotification(adminId, payload) {
  const subscription = subscriptions.get(adminId);
  
  if (!subscription) {
    console.log(`[push] No subscription found for admin ${adminId}`);
    return false;
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/Customnest pic.png',
        badge: payload.badge || '/Customnest pic.png',
        tag: payload.tag || 'customnest-notification',
        data: payload.data || {},
        requireInteraction: payload.requireInteraction || false,
        vibrate: [200, 100, 200]
      })
    );
    console.log(`[push] Notification sent to admin ${adminId}: ${payload.title}`);
    return true;
  } catch (error) {
    console.error(`[push] Error sending notification to admin ${adminId}:`, error.message);
    
    // If subscription is no longer valid (410 Gone), remove it
    if (error.statusCode === 410) {
      subscriptions.delete(adminId);
      console.log(`[push] Invalid subscription removed for admin ${adminId}`);
    }
    return false;
  }
}

/**
 * Send notification to all admin subscribers
 */
export async function broadcastNotification(payload) {
  const results = [];
  for (const [adminId] of subscriptions) {
    const result = await sendNotification(adminId, payload);
    results.push({ adminId, success: result });
  }
  return results;
}

// Predefined notification templates
export const NotificationTemplates = {
  newOrder: (order) => ({
    title: '🛒 New Order Received!',
    body: `Order #${order.orderNumber} - ₹${order.total}`,
    tag: 'new-order',
    data: { type: 'order', orderId: order._id || order.id }
  }),
  
  newCustomOrder: (request) => ({
    title: '🎨 New Custom Order Request!',
    body: `${request.productType} - ${request.name}`,
    tag: 'new-custom-order',
    data: { type: 'custom-order', requestId: request._id || request.id }
  }),
  
  newReview: (review) => ({
    title: '⭐ New Review Received!',
    body: `${review.rating} stars: ${review.comment?.substring(0, 50) || 'No comment'}...`,
    tag: 'new-review',
    data: { type: 'review', reviewId: review._id || review.id }
  }),
  
  newContact: (message) => ({
    title: '💬 New Contact Inquiry!',
    body: `${message.name}: ${message.subject || message.message.substring(0, 40)}...`,
    tag: 'new-contact',
    data: { type: 'contact', messageId: message._id || message.id }
  }),
  
  paymentScreenshot: (order) => ({
    title: '💳 Payment Uploaded!',
    body: `Order #${order.orderNumber} - Waiting for verification`,
    tag: 'payment-screenshot',
    data: { type: 'order', orderId: order._id || order.id }
  })
};

export default {
  getPublicKey,
  saveSubscription,
  removeSubscription,
  sendNotification,
  broadcastNotification,
  NotificationTemplates
};