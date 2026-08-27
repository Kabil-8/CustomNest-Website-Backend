/**
 * cleanupJobs.js
 * Background maintenance tasks that run on a timer after the server starts.
 */
import Order from '../models/Order.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Deletes Pending orders that were created more than 1 hour ago.
 * These are orders where the customer started checkout but never completed
 * payment, so they should never count towards revenue or fulfillment.
 */
export async function deleteStalePendingOrders() {
  const cutoff = new Date(Date.now() - ONE_HOUR_MS);
  try {
    const result = await Order.deleteMany({
      status: 'Pending',
      createdAt: { $lt: cutoff },
    });
    if (result.deletedCount > 0) {
      console.log(`[cleanup] Removed ${result.deletedCount} stale pending order(s) older than 1 hour`);
    }
  } catch (err) {
    console.error('[cleanup] Failed to delete stale pending orders:', err.message);
  }
}

/**
 * Registers all cleanup jobs to run on an interval.
 * Call once after the DB is connected.
 */
export function startCleanupJobs() {
  // Run once immediately on startup to clear any orders left over from before
  deleteStalePendingOrders();

  // Then run every 15 minutes
  setInterval(deleteStalePendingOrders, 15 * 60 * 1000);

  console.log('[cleanup] Stale-pending-order cleanup job registered (runs every 15 min)');
}
