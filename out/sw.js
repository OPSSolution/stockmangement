self.addEventListener('push', function(event) {
  try {
    const data = event.data ? event.data.json() : {};
    event.waitUntil(
      self.registration.showNotification(data.title || 'StockManagement Alert', {
        body: data.body || 'You have a new notification',
        icon: data.icon || '/favicon.ico',
        badge: data.badge || '/favicon.ico',
        tag: data.tag || 'stockmanagement-alert',
        requireInteraction: data.requireInteraction || false,
        data: data.url ? { url: data.url } : undefined,
        actions: data.actions || [],
      })
    );
  } catch (e) {
    event.waitUntil(
      self.registration.showNotification('StockManagement Alert', {
        body: 'You have a new notification',
        icon: '/favicon.ico',
        tag: 'stockmanagement-alert',
      })
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});