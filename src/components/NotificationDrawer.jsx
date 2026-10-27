import { useState, useEffect } from 'react'
import {
  Bell,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Moon,
  Smartphone,
  Send,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react'
import {
  isPushSupported,
  isIos,
  isIosStandalone,
  getNotificationPermission,
  requestNotificationPermission,
  loadNotificationSettings,
  saveNotificationSettings,
  showLocalTestNotification,
  registerFcmToken
} from '../lib/notifications'

export default function NotificationDrawer({
  isOpen,
  onClose,
  uid,
  todayEntry,
  onNavigateToToday
}) {
  const [settings, setSettings] = useState({
    enabled: true,
    reminderTime: '21:00',
    timezone: 'Asia/Kolkata',
    fcmTokens: [],
    history: []
  })
  const [permission, setPermission] = useState('default')
  const [saving, setSaving] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  const isSupported = isPushSupported()
  const isApple = isIos()
  const isAppleStandalone = isIosStandalone()
  const needsIosPwaPrompt = isApple && !isAppleStandalone

  useEffect(() => {
    if (isOpen) {
      setPermission(getNotificationPermission())
      setTestSent(false)
      setErrorMessage('')
      if (uid) {
        loadNotificationSettings(uid).then((s) => {
          if (s) setSettings(s)
        })
      }
    }
  }, [isOpen, uid])

  if (!isOpen) return null

  // Evaluate today's dinner & meal status
  const hasDinner = Boolean(todayEntry?.dinner)
  const hasPartial = Boolean(todayEntry?.breakfast || todayEntry?.lunch)
  const hasAny = hasDinner || hasPartial

  async function handleToggleEnabled() {
    const nextEnabled = !settings.enabled
    setSaving(true)
    setErrorMessage('')
    try {
      // If enabling and permission is not granted yet, ask for permission now
      if (nextEnabled && permission === 'default' && isSupported) {
        const nextPerm = await requestNotificationPermission()
        setPermission(nextPerm)
        if (nextPerm !== 'granted') {
          // If user dismissed or blocked, don't enable
          setSaving(false)
          return
        }
        await registerFcmToken(uid)
      } else if (nextEnabled && permission === 'granted') {
        await registerFcmToken(uid)
      }

      const nextSettings = { ...settings, enabled: nextEnabled }
      setSettings(nextSettings)
      await saveNotificationSettings(uid, { enabled: nextEnabled })
    } catch (err) {
      console.error('Failed to toggle notifications:', err)
      setErrorMessage('Could not update notification preferences. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRequestPermissionDirectly() {
    setErrorMessage('')
    try {
      const nextPerm = await requestNotificationPermission()
      setPermission(nextPerm)
      if (nextPerm === 'granted') {
        const nextSettings = { ...settings, enabled: true }
        setSettings(nextSettings)
        await saveNotificationSettings(uid, { enabled: true })
        await registerFcmToken(uid)
      }
    } catch (err) {
      console.error('Permission request failed:', err)
      setErrorMessage(err.message || 'Permission request was cancelled or failed.')
    }
  }

  async function handleSendTest() {
    setErrorMessage('')
    setTestSent(false)
    try {
      if (permission !== 'granted') {
        const nextPerm = await requestNotificationPermission()
        setPermission(nextPerm)
        if (nextPerm !== 'granted') {
          setErrorMessage('Please allow notifications in your browser first to test.')
          return
        }
      }
      await showLocalTestNotification()
      setTestSent(true)
      setTimeout(() => setTestSent(false), 5000)
    } catch (err) {
      console.error('Failed to trigger test notification:', err)
      setErrorMessage(err.message || 'Could not display test notification.')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-center-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
    >
      {/* Backdrop tap to close */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Drawer Container */}
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden z-10 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-primary flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="notification-center-title"
                className="font-headline font-bold text-base text-slate-900"
              >
                Notifications & Reminders
              </h2>
              <p className="text-[11px] text-slate-500 font-body">
                Daily nightly checks for unlogged meals
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notification settings"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs font-body">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-due/10 text-due border border-due/20 flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed font-medium">{errorMessage}</p>
            </div>
          )}

          {/* iOS Non-PWA Alert */}
          {needsIosPwaPrompt && (
            <div className="p-3.5 rounded-2xl bg-amber/10 border border-amber/20 text-slate-800">
              <div className="flex items-center gap-2 mb-1 text-amber font-semibold text-xs">
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>iPhone Notification Setup Required</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed mb-2">
                Apple requires web apps to be installed to the Home Screen to enable lock-screen push alerts.
              </p>
              <div className="text-[11px] bg-white/80 p-2 rounded-xl text-slate-700 font-medium">
                Tap Safari&apos;s <span className="font-bold">Share</span> button (bottom bar) &rarr; choose <span className="font-bold">&quot;Add to Home Screen&quot;</span>.
              </div>
            </div>
          )}

          {/* Main Reminder Toggle Card */}
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 hover:border-slate-300 transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Moon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-headline font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    Daily 9:00 PM Reminder
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Check if you forgot to log today&apos;s dinner or meals before sleeping.
                  </p>
                </div>
              </div>

              {/* Modern iOS-style Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={settings.enabled}
                aria-label="Toggle 9:00 PM reminder"
                disabled={saving}
                onClick={handleToggleEnabled}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  settings.enabled ? 'bg-primary' : 'bg-slate-300'
                } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    settings.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Permission Status Pill */}
            <div className="mt-3.5 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">Device Permission:</span>
              {permission === 'granted' ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />
                  Active
                </span>
              ) : permission === 'denied' ? (
                <span className="inline-flex items-center gap-1 text-due font-semibold bg-due/10 px-2 py-0.5 rounded-full border border-due/20">
                  <AlertCircle className="w-3 h-3" />
                  Blocked in Browser
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestPermissionDirectly}
                  className="inline-flex items-center gap-1 text-primary hover:text-primary-dark font-semibold bg-blue-50 hover:bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-200 transition-all"
                >
                  <Bell className="w-3 h-3" />
                  Enable Permission
                </button>
              )}
            </div>
          </div>

          {/* Today's Evening Status Preview */}
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-headline">
                Today&apos;s Status Check (9:00 PM Preview)
              </span>
              <Clock className="w-3.5 h-3.5 text-slate-400" />
            </div>

            {hasDinner ? (
              <div className="flex items-start gap-2.5 text-emerald-700 bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <div>
                  <p className="font-semibold text-xs">Dinner is already logged</p>
                  <p className="text-[11px] text-emerald-600/90 mt-0.5">
                    Smart suppression active: No reminder will be sent tonight.
                  </p>
                </div>
              </div>
            ) : hasPartial ? (
              <div className="flex items-start justify-between gap-2 text-amber-800 bg-amber/10 p-2.5 rounded-xl border border-amber/20">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber" />
                  <div>
                    <p className="font-semibold text-xs">Dinner is currently pending</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      You will receive an evening alert if not logged by 9:00 PM.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onNavigateToToday?.()
                  }}
                  className="shrink-0 text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5"
                >
                  Log Now
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                  <div>
                    <p className="font-semibold text-xs">No meals logged for today yet</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      A daily check will remind you to update today&apos;s attendance.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onNavigateToToday?.()
                  }}
                  className="shrink-0 text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5"
                >
                  Open Today
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Test Notification Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleSendTest}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-headline font-semibold text-xs shadow-2xs hover:shadow-xs active:scale-98 transition-all"
            >
              <Send className="w-3.5 h-3.5 text-primary" />
              <span>Send Test Notification to This Device</span>
            </button>

            {testSent && (
              <p className="text-center text-[11px] text-emerald-600 font-medium mt-1.5 animate-in fade-in">
                &check; Test notification sent! Check your notification shade.
              </p>
            )}
          </div>

          {/* Troubleshooting Collapsible */}
          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setShowHelp((prev) => !prev)}
              className="flex items-center justify-between w-full text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" />
                No sound or notifications blocked?
              </span>
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  showHelp ? 'rotate-90' : ''
                }`}
              />
            </button>

            {showHelp && (
              <div className="mt-2.5 p-3 rounded-xl bg-slate-50 text-slate-600 text-[11px] space-y-2.5 animate-in fade-in">
                <div>
                  <p className="font-semibold text-slate-800 mb-1">🔔 How to enable notification sound on Android:</p>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                    <li>Long-press the <span className="font-medium text-slate-900">Mess Tracker</span> (or Chrome) icon on your home screen &rarr; tap <span className="font-medium text-slate-900">App info (ⓘ)</span>.</li>
                    <li>Tap <span className="font-medium text-slate-900">Notifications</span> &rarr; tap <span className="font-medium text-slate-900">Notification categories</span> (or Sites).</li>
                    <li>Find <span className="font-mono text-slate-800">mess-tracker-8ff02.web.app</span> &rarr; change from <span className="font-medium text-amber">Silent</span> to <span className="font-medium text-emerald-600">Default / Alerting</span>.</li>
                    <li>Select your favorite notification tone/ringtone!</li>
                  </ol>
                </div>

                <div className="pt-1.5 border-t border-slate-200/60">
                  <p className="font-semibold text-slate-800 mb-1">🔒 If blocked in browser settings:</p>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                    <li>Tap the tune / lock icon next to the URL in your browser bar.</li>
                    <li>Tap <span className="font-medium text-slate-900">Permissions</span> &rarr; switch to <span className="font-medium text-emerald-600">Allow</span>.</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>Automatic 9:00 PM IST Schedule</span>
          <button
            type="button"
            onClick={onClose}
            className="font-headline font-bold text-slate-700 hover:text-slate-900"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
