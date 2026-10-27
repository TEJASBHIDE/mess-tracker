/* eslint-disable no-undef */
// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js')

const firebaseConfig = {
  apiKey: 'AIzaSyC_KV6gzSMC99BQRxYi6hwxu_1KNecL77M',
  authDomain: 'mess-tracker-8ff02.firebaseapp.com',
  projectId: 'mess-tracker-8ff02',
  storageBucket: 'mess-tracker-8ff02.firebasestorage.app',
  messagingSenderId: '714498279682',
  appId: '1:714498279682:web:c4802800c171f9def81a1b',
  measurementId: 'G-EHCXNY9B66'
}

firebase.initializeApp(firebaseConfig)
const messaging = firebase.messaging()

// Background push notification handler
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload)
  const notificationTitle =
    payload.notification?.title || payload.data?.title || 'Mess Tracker — Daily Reminder'
  const notificationOptions = {
    body:
      payload.notification?.body ||
      payload.data?.body ||
      'Did you have dinner tonight? Tap to update your mess log.',
    icon: payload.notification?.icon || '/logo-primary.png',
    badge: '/favicon.svg',
    tag: payload.data?.tag || 'mess-tracker-reminder',
    vibrate: [200, 100, 200],
    data: {
      url: payload.data?.url || '/?tab=today'
    }
  }

  return self.registration.showNotification(notificationTitle, notificationOptions)
})

// Handle tapping on the notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetPath = event.notification.data?.url || '/?tab=today'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetPath)
          }
          return client.focus()
        }
      }
      // Otherwise open new window/PWA
      if (clients.openWindow) {
        return clients.openWindow(targetPath)
      }
    })
  )
})
