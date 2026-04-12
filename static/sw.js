// Planner 2026 — Service Worker
// Handles Web Push notifications

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', function(e) {
  if (!e.data) return;
  var data = {};
  try { data = e.data.json(); } catch(_) { data = { title: 'Planner 2026', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(data.title || 'Planner 2026', {
      body:    data.body || '',
      icon:    '/static/img/icon-192.png',
      badge:   '/static/img/icon-72.png',
      tag:     data.tag  || 'planner-notif',
      data:    data,
      vibrate: [200, 100, 200],
      requireInteraction: false
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cls) {
      if (cls.length > 0) { cls[0].focus(); return; }
      return self.clients.openWindow('/');
    })
  );
});
