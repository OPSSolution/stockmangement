import { api } from './api';

export type AdminNotifyType = 'new_request' | 'new_order' | 'new_delivery' | 'new_transfer';

/**
 * Creates one notification row per admin — operational events (new request,
 * order, delivery, transfer) are admin-facing only; regular staff/viewers
 * only ever get stock-level alerts (handled separately by the low/out-of-stock
 * checker, which targets every user). Routed through the server (service
 * role) rather than a direct Supabase call, since the public order form has
 * no logged-in user and can't read `profiles` to find admins under RLS.
 * Fire-and-forget: never await this, a notification failing to send
 * shouldn't block the action that triggered it.
 */
export function notifyAdmins(type: AdminNotifyType, title: string, message: string, data?: Record<string, unknown>) {
  api.functions.invoke('notify-admins', { body: { type, title, message, data } }).then(({ error }) => {
    if (error) console.error('Failed to notify admins:', error);
  });
}
