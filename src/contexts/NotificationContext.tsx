import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useServiceWorker, urlBase64ToUint8Array } from '@/hooks/useServiceWorker';
import { logAudit } from '@/lib/auditLog';

export interface Notification {
  id: string;
  user_id: string | null;
  type: 'low_stock' | 'out_of_stock' | 'new_order' | 'return_pending' | 'transfer_ready' | 'delivery_delayed' | 'system';
  title: string;
  message: string;
  data: Record<string, unknown>;
  is_read: boolean;
  is_emailed: boolean;
  is_sms_sent: boolean;
  created_at: string;
}

export interface NotificationSettings {
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  browser_push_enabled: boolean;
  category_thresholds: Record<string, number>;
  created_at: string;
  updated_at: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  settings: NotificationSettings | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  requestBrowserPush: () => Promise<boolean>;
  browserPushSupported: boolean;
  browserPushPermission: 'granted' | 'denied' | 'default';
  browserPushSubscribed: boolean;
  subscribeBrowserPush: () => Promise<boolean>;
  unsubscribeBrowserPush: () => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [browserPushSupported] = useState(() => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator);
  const [browserPushPermission, setBrowserPushPermission] = useState<'granted' | 'denied' | 'default'>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [browserPushSubscribed, setBrowserPushSubscribed] = useState(false);

  const { register, subscribeToPush, unsubscribeFromPush, getPushSubscription } = useServiceWorker();

  const fetchSettings = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (!error && data) {
      setSettings(data as unknown as NotificationSettings);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setNotifications(data as Notification[]);
    }
    setLoading(false);
  }, []);

  const checkPushSubscription = useCallback(async () => {
    if (!browserPushSupported) return;
    try {
      const sub = await getPushSubscription();
      setBrowserPushSubscribed(!!sub);
    } catch {
      setBrowserPushSubscribed(false);
    }
  }, [browserPushSupported, getPushSubscription]);

  useEffect(() => {
    fetchNotifications();
    fetchSettings();
    checkPushSubscription();
  }, [fetchNotifications, fetchSettings, checkPushSubscription]);

  // Register service worker on mount
  useEffect(() => {
    if (browserPushSupported) {
      register();
    }
  }, [browserPushSupported, register]);

  const requestBrowserPush = useCallback(async () => {
    if (!browserPushSupported) return false;
    try {
      const permission = await Notification.requestPermission();
      setBrowserPushPermission(permission);
      return permission === 'granted';
    } catch {
      return false;
    }
  }, [browserPushSupported]);

  const subscribeBrowserPush = useCallback(async () => {
    if (!browserPushSupported) return false;
    try {
      // Ensure permission is granted
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
        setBrowserPushPermission(permission);
      }
      if (permission !== 'granted') return false;

      // Fetch VAPID public key from edge function
      const { data: vapidData, error: vapidError } = await api.functions.invoke('get-vapid-public-key', {});
      if (vapidError || !vapidData?.publicKey) {
        console.error('Failed to get VAPID key:', vapidError);
        return false;
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidData.publicKey);
      const subscription = await subscribeToPush(applicationServerKey);
      if (!subscription) return false;

      // Store subscription in DB
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return false;

      const subJson = subscription.toJSON();
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: userData.user.id,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth,
      }, { onConflict: 'endpoint' });

      if (!error) {
        setBrowserPushSubscribed(true);
        logAudit({ action: 'create', module: 'notifications', description: 'Enabled browser push notifications' });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Push subscription failed:', err);
      return false;
    }
  }, [browserPushSupported, subscribeToPush]);

  const unsubscribeBrowserPush = useCallback(async () => {
    if (!browserPushSupported) return false;
    try {
      const unsubscribed = await unsubscribeFromPush();
      if (unsubscribed) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          await supabase.from('push_subscriptions').delete().eq('user_id', userData.user.id);
        }
        setBrowserPushSubscribed(false);
        logAudit({ action: 'delete', module: 'notifications', description: 'Disabled browser push notifications' });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [browserPushSupported, unsubscribeFromPush]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('notifications_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new as Notification;
            setNotifications((prev) => [newNotif, ...prev].slice(0, 50));

            // Browser push for critical alerts
            if (
              browserPushSupported &&
              browserPushPermission === 'granted' &&
              settings?.browser_push_enabled &&
              (newNotif.type === 'out_of_stock' || newNotif.type === 'low_stock') &&
              !newNotif.is_read
            ) {
              try {
                new Notification(newNotif.title, {
                  body: newNotif.message,
                  icon: '/favicon.ico',
                  tag: newNotif.id,
                  requireInteraction: newNotif.type === 'out_of_stock',
                });
              } catch {
                // Silently fail if notification fails
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Notification;
            setNotifications((prev) =>
              prev.map((n) => (n.id === updated.id ? updated : n))
            );
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Notification;
            setNotifications((prev) => prev.filter((n) => n.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [browserPushSupported, browserPushPermission, settings?.browser_push_enabled]);

  // Also watch products table for stock changes that might trigger notifications
  useEffect(() => {
    const channel = supabase
      .channel('products_stock_realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products' },
        () => {
          setTimeout(() => fetchNotifications(), 500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

  // Watch settings table for real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('settings_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notification_settings' },
        () => {
          fetchSettings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  // Auto-request browser push permission if enabled in settings
  useEffect(() => {
    if (
      settings?.browser_push_enabled &&
      browserPushSupported &&
      browserPushPermission === 'default' &&
      !browserPushSubscribed
    ) {
      // Don't auto-subscribe — user must click the toggle
      // Just update the permission state if they've previously allowed
      if (Notification.permission === 'granted') {
        setBrowserPushPermission('granted');
      }
    }
  }, [settings?.browser_push_enabled, browserPushSupported, browserPushPermission, browserPushSubscribed]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    logAudit({ action: 'update', module: 'notifications', description: 'Marked all notifications as read' });
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    logAudit({ action: 'delete', module: 'notifications', description: 'Deleted a notification', referenceId: id });
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        settings,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        refresh: async () => {
          await fetchNotifications();
          await fetchSettings();
          await checkPushSubscription();
        },
        requestBrowserPush,
        browserPushSupported,
        browserPushPermission,
        browserPushSubscribed,
        subscribeBrowserPush,
        unsubscribeBrowserPush,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}