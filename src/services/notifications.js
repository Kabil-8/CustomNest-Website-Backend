import { sendNotification, NotificationTemplates } from './pushNotification.js';

/**
 * Send notification to admin when a new order is created
 */
export async function notifyNewOrder(order) {
  const payload = NotificationTemplates.newOrder(order);
  // For now, we broadcast to a single admin (admin ID hardcoded or from env)
  const adminId = process.env.ADMIN_ID || 'admin';
  await sendNotification(adminId, payload);
  
  // Also notify custom admin ID if different
  if (process.env.ADMIN_ID_2 && process.env.ADMIN_ID_2 !== adminId) {
    await sendNotification(process.env.ADMIN_ID_2, payload);
  }
}

/**
 * Send notification to admin when a new custom order is submitted
 */
export async function notifyNewCustomOrder(request) {
  const payload = NotificationTemplates.newCustomOrder(request);
  const adminId = process.env.ADMIN_ID || 'admin';
  await sendNotification(adminId, payload);
  
  if (process.env.ADMIN_ID_2) {
    await sendNotification(process.env.ADMIN_ID_2, payload);
  }
}

/**
 * Send notification to admin when a new review is created
 */
export async function notifyNewReview(review) {
  const payload = NotificationTemplates.newReview(review);
  const adminId = process.env.ADMIN_ID || 'admin';
  await sendNotification(adminId, payload);
  
  if (process.env.ADMIN_ID_2) {
    await sendNotification(process.env.ADMIN_ID_2, payload);
  }
}

/**
 * Send notification to admin when a new contact inquiry is submitted
 */
export async function notifyNewContact(message) {
  const payload = NotificationTemplates.newContact(message);
  const adminId = process.env.ADMIN_ID || 'admin';
  await sendNotification(adminId, payload);
  
  if (process.env.ADMIN_ID_2) {
    await sendNotification(process.env.ADMIN_ID_2, payload);
  }
}

/**
 * Send notification to admin when a payment screenshot is uploaded
 */
export async function notifyPaymentScreenshot(order) {
  const payload = NotificationTemplates.paymentScreenshot(order);
  const adminId = process.env.ADMIN_ID || 'admin';
  await sendNotification(adminId, payload);
  
  if (process.env.ADMIN_ID_2) {
    await sendNotification(process.env.ADMIN_ID_2, payload);
  }
}