import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getToken, onMessage } from 'firebase/messaging'
import { db, getAppMessaging } from '../firebase'

export function isPushSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}

export function isIos() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(ua)
}

export function isIosStandalone() {
  if (typeof window === 'undefined') return false
  return ('standalone' in window.navigator) && window.navigator.standalone === true
}

export function getDeviceDescription() {
  if (typeof window === 'undefined') return 'Unknown Device'
  const ua = window.navigator.userAgent
  let os = 'Unknown OS'
  if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Macintosh/i.test(ua)) os = 'macOS'
  else if (/Linux/i.test(ua)) os = 'Linux'

  const isStandalone = (window.navigator.standalone === true) || window.matchMedia('(display-mode: standalone)').matches
  return `${os} (${isStandalone ? 'Installed PWA' : 'Browser'})`
}

export function getNotificationPermission() {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission // 'default', 'granted', 'denied'
}

export async function requestNotificationPermission() {
  if (!isPushSupported()) {
    throw new Error('Notifications are not supported on this browser or device.')
  }
  const permission = await Notification.requestPermission()
  return permission
}

export async function loadNotificationSettings(uid) {
  if (!uid) return null
  try {
    const ref = doc(db, 'users', uid, 'settings', 'notifications')
    const snap = await getDoc(ref)
    if (snap.exists()) {
      return snap.data()
    }
    // Return sensible defaults if document doesn't exist yet
    return {
      enabled: true,
      reminderTime: '21:00',
      timezone: 'Asia/Kolkata',
      fcmTokens: [],
      history: []
    }
  } catch (err) {
    console.error('Error loading notification settings:', err)
    return {
      enabled: true,
      reminderTime: '21:00',
      timezone: 'Asia/Kolkata',
      fcmTokens: [],
      history: []
    }
  }
}

export async function saveNotificationSettings(uid, data) {
  if (!uid) return
  try {
    const ref = doc(db, 'users', uid, 'settings', 'notifications')
    await setDoc(ref, data, { merge: true })
  } catch (err) {
    console.error('Error saving notification settings:', err)
    throw err
  }
}

// Registers service worker, obtains FCM push token, and stores it in Firestore
export async function registerFcmToken(uid) {
  if (!uid || !isPushSupported()) return null
  if (Notification.permission !== 'granted') return null

  try {
    const messaging = await getAppMessaging()
    if (!messaging) return null

    // Register FCM Service Worker
    const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    })
    await navigator.serviceWorker.ready

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined
    const tokenOptions = {
      serviceWorkerRegistration: swRegistration
    }
    if (vapidKey) {
      tokenOptions.vapidKey = vapidKey
    }

    const token = await getToken(messaging, tokenOptions)
    if (!token) {
      console.warn('No FCM registration token received.')
      return null
    }

    // Save token to Firestore under users/{uid}/settings/notifications
    const currentSettings = await loadNotificationSettings(uid)
    const existingTokens = Array.isArray(currentSettings?.fcmTokens) ? currentSettings.fcmTokens : []

    const deviceDesc = getDeviceDescription()
    const nowIso = new Date().toISOString()

    // Filter out duplicate token entry if already present
    const updatedTokens = existingTokens.filter((t) => t.token !== token)
    updatedTokens.push({
      token,
      device: deviceDesc,
      updatedAt: nowIso,
      createdAt: existingTokens.find((t) => t.token === token)?.createdAt || nowIso
    })

    await saveNotificationSettings(uid, {
      enabled: currentSettings?.enabled !== false,
      reminderTime: currentSettings?.reminderTime || '21:00',
      timezone: currentSettings?.timezone || 'Asia/Kolkata',
      fcmTokens: updatedTokens
    })

    // Store in localStorage for rapid reference on logout
    try {
      localStorage.setItem('mess_fcm_token', token)
    } catch {}

    return token
  } catch (err) {
    console.error('Failed to register FCM token:', err)
    return null
  }
}

// Removes current device token on logout or when notifications are turned off
export async function removeCurrentFcmToken(uid) {
  if (!uid) return
  try {
    const currentToken = localStorage.getItem('mess_fcm_token')
    if (!currentToken) return

    const currentSettings = await loadNotificationSettings(uid)
    if (Array.isArray(currentSettings?.fcmTokens)) {
      const filtered = currentSettings.fcmTokens.filter((t) => t.token !== currentToken)
      await saveNotificationSettings(uid, { fcmTokens: filtered })
    }
    localStorage.removeItem('mess_fcm_token')
  } catch (err) {
    console.warn('Failed to remove current FCM token:', err)
  }
}

// Listen for foreground push notifications when app is actively open
export async function listenToForegroundMessages(onMessageCallback) {
  try {
    const messaging = await getAppMessaging()
    if (!messaging) return () => {}
    return onMessage(messaging, (payload) => {
      console.log('Received foreground message:', payload)
      if (onMessageCallback) {
        onMessageCallback(payload)
      }
    })
  } catch (err) {
    console.warn('Foreground message listener error:', err)
    return () => {}
  }
}

export async function showLocalTestNotification() {
  if (!isPushSupported() || Notification.permission !== 'granted') {
    throw new Error('Notification permission is not granted.')
  }

  const title = 'Mess Tracker — Daily Reminder'
  const options = {
    body: 'Did you have dinner tonight? Tap to mark your dinner in Mess Tracker.',
    icon: '/logo-primary.png',
    badge: '/favicon.svg',
    tag: 'mess-tracker-test',
    vibrate: [200, 100, 200],
    data: {
      url: '/?tab=today'
    }
  }

  // Try showing via service worker first for accurate mobile behavior
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      if (reg && reg.showNotification) {
        return reg.showNotification(title, options)
      }
    } catch {
      // Fallback to standard window Notification
    }
  }

  return new Notification(title, options)
}
