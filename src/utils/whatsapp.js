/**
 * whatsapp.js — Send WhatsApp notifications to the admin phone using CallMeBot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE-TIME SETUP (do this once on your phone, takes 2 minutes):
 *
 *  1. Save the number +34 644 59 78 63 as a contact in your phone (name it
 *     anything, e.g. "CallMeBot").
 *
 *  2. Send this WhatsApp message to that contact:
 *        I allow callmebot to send me messages
 *
 *  3. You will receive a reply with your personal API key, e.g.:
 *        Your APIKEY is 1234567
 *
 *  4. Add these two lines to your backend/.env file:
 *        WHATSAPP_PHONE=91XXXXXXXXXX     ← your number with country code, no +
 *        WHATSAPP_APIKEY=1234567         ← the key CallMeBot sent you
 *
 *  5. Restart the backend. Done — all new custom orders will ping your WhatsApp.
 *
 * Free plan limits: ~100 messages/day. More than enough for a small store.
 * Docs: https://www.callmebot.com/blog/free-api-whatsapp-messages/
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Sends a WhatsApp message to the admin phone configured in .env.
 *
 * @param {string} message  Plain text message (max ~1500 chars).
 * @returns {Promise<{sent: boolean, provider: string, error?: string}>}
 */
export async function sendWhatsAppNotification(message) {
  const phone  = process.env.WHATSAPP_PHONE?.trim();
  const apiKey = process.env.WHATSAPP_APIKEY?.trim();

  // Silently skip if not configured — never crash the main request flow
  if (!phone || !apiKey || phone === 'your_whatsapp_number' || apiKey === 'your_callmebot_apikey') {
    console.warn('[WhatsApp] WHATSAPP_PHONE or WHATSAPP_APIKEY not set in .env — notification skipped.');
    return { sent: false, provider: 'callmebot', error: 'not_configured' };
  }

  try {
    const url = new URL('https://api.callmebot.com/whatsapp.php');
    url.searchParams.set('phone',  phone);
    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('text',   message);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    const body = await res.text();

    if (res.ok && !body.toLowerCase().includes('error')) {
      console.log(`[WhatsApp] Notification sent to +${phone}`);
      return { sent: true, provider: 'callmebot' };
    }

    console.error('[WhatsApp] CallMeBot responded with error:', body.slice(0, 200));
    return { sent: false, provider: 'callmebot', error: body.slice(0, 200) };
  } catch (err) {
    console.error('[WhatsApp] Failed to send notification:', err.message);
    return { sent: false, provider: 'callmebot', error: err.message };
  }
}

/**
 * Builds the WhatsApp message for a new custom order request.
 *
 * @param {object} order  Mongoose document or plain object from CustomOrderRequest
 * @returns {string}
 */
export function buildCustomOrderMessage(order) {
  const lines = [
    '🧶 *New Custom Order — TheCustomNest*',
    '',
    `👤 *Customer:* ${order.name}`,
    `📱 *Phone:* ${order.phone}`,
    `📧 *Email:* ${order.email}`,
    '',
    `🎁 *Product Type:* ${order.productType}`,
    order.colors    ? `🎨 *Colors:* ${order.colors}`          : null,
    order.size      ? `📐 *Size:* ${order.size}`               : null,
    order.quantity  ? `🔢 *Quantity:* ${order.quantity}`       : null,
    order.budget    ? `💰 *Budget:* ${order.budget}`           : null,
    order.deadline  ? `📅 *Deadline:* ${order.deadline}`       : null,
    '',
    `📝 *Details:*`,
    order.description,
    '',
    `🔗 Review in admin: http://localhost:5173/admin/custom-orders`,
  ];

  return lines.filter((l) => l !== null).join('\n');
}

/**
 * Builds the WhatsApp message for when admin accepts a custom order.
 *
 * @param {object} order  Mongoose document or plain object from CustomOrderRequest
 * @returns {string}
 */
export function buildCustomOrderAcceptedMessage(order) {
  const lines = [
    '🎉 *Your Custom Order is Accepted! — TheCustomNest*',
    '',
    `Hi ${order.name}!`,
    '',
    `Great news! We've accepted your custom order request for "${order.productType}".`,
    '',
    `💰 *Agreed Price:* ₹${order.agreedPrice}`,
    order.quantity > 1 ? `🔢 *Quantity:* ${order.quantity}` : null,
    '',
    `✅ *Next Steps:*`,
    `1. Visit your account: http://localhost:5173/account/custom-orders`,
    `2. Click "Proceed to Payment" to complete your order`,
    `3. We'll start crafting once payment is confirmed!`,
    '',
    `📱 Questions? Reply to this message or call us.`,
    '',
    `Thank you for choosing TheCustomNest! 🧶`,
  ];

  return lines.filter((l) => l !== null).join('\n');
}