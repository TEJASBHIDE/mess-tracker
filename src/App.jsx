import { useEffect, useState, useRef } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from './firebase'
import Login from './components/Login'
import NavTabs from './components/NavTabs'
import Today from './components/Today'
import Prices from './components/Prices'
import Summary from './components/Summary'
import Logo from './components/Logo'
import NotificationDrawer from './components/NotificationDrawer'
import { Bell, LogOut, X } from 'lucide-react'
import { todayStr } from './lib/dateUtils'
import {
  registerFcmToken,
  removeCurrentFcmToken,
  listenToForegroundMessages
} from './lib/notifications'

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = checking, null = signed out
  const [tab, setTab] = useState('today')
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [todayEntry, setTodayEntry] = useState(null)
  const [foregroundBanner, setForegroundBanner] = useState(null)
  const profileMenuRef = useRef(null)

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u))
  }, [])

  useEffect(() => {
    if (!user) {
      setTodayEntry(null)
      return
    }

    // Keep FCM token synced if notifications are granted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      registerFcmToken(user.uid).catch((err) => console.warn('Background FCM sync error:', err))
    }

    // Listen for foreground push messages
    let unsubForeground = () => {}
    listenToForegroundMessages((payload) => {
      const title = payload.notification?.title || payload.data?.title || 'Mess Tracker Reminder'
      const body = payload.notification?.body || payload.data?.body || 'Did you log your meals for today?'
      setForegroundBanner({ title, body })
    }).then((unsub) => {
      if (typeof unsub === 'function') unsubForeground = unsub
    })

    const today = todayStr()
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'dailyEntries', today), (snap) => {
      if (snap.exists()) {
        setTodayEntry(snap.data())
      } else {
        setTodayEntry(null)
      }
    })
    return () => {
      unsub()
      unsubForeground()
    }
  }, [user])

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false)
      }
    }
    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [showProfileMenu])

  if (user === undefined) {
    return <div className="min-h-screen bg-paper flex items-center justify-center text-inkSoft">Loading…</div>
  }

  if (!user) {
    return <Login />
  }

  function handleSelectDateAndEdit(date) {
    setSelectedDate(date)
    setTab('today')
  }

  const userInitial = (user.displayName || user.email || 'U')[0].toUpperCase()
  const isDinnerPending = !todayEntry?.dinner

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-body antialiased flex flex-col selection:bg-blue-100 selection:text-primary">
      {/* TopAppBar Component */}
      <header className="fixed top-0 left-0 w-full z-40 flex justify-between items-center px-4 py-3 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs transition-all">
        {/* Left Side: Brand Logo & Title */}
        <div className="flex items-center space-x-2.5">
          <Logo className="w-10 h-10" />
          <h1 className="font-headline font-extrabold text-lg tracking-tight text-slate-900">
            Mess Tracker
          </h1>
        </div>

        {/* Right Side: Notifications Bell & Profile Avatar with Dropdown */}
        <div className="flex items-center space-x-1.5 relative" ref={profileMenuRef}>
          {/* Notifications Bell */}
          <button
            type="button"
            onClick={() => setShowNotifications(true)}
            aria-label="Open notifications and reminders"
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
            title={isDinnerPending ? "Pending meals to log" : "All meals logged"}
          >
            <Bell className="w-5 h-5 text-slate-600" />
            {isDinnerPending && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-white animate-pulse"></span>
            )}
          </button>

          {/* Interactive Profile Avatar Button */}
          <button
            type="button"
            onClick={() => setShowProfileMenu((prev) => !prev)}
            className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-primary font-headline font-bold text-sm shadow-xs hover:ring-2 hover:ring-primary/20 active:scale-95 transition-all overflow-hidden"
            title={user.displayName || user.email || 'My Account'}
            aria-expanded={showProfileMenu}
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              userInitial
            )}
          </button>

          {/* Profile Dropdown Popover */}
          {showProfileMenu && (
            <div className="absolute right-0 top-12 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 py-3 px-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 pb-3 mb-2 border-b border-slate-100 px-1">
                <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-primary font-headline font-bold text-base shrink-0 overflow-hidden shadow-2xs">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    userInitial
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-headline font-bold text-xs text-slate-900 truncate">
                    {user.displayName || 'User Account'}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate font-mono">
                    {user.email || ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  setShowProfileMenu(false)
                  if (user?.uid) {
                    await removeCurrentFcmToken(user.uid)
                  }
                  signOut(auth)
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-due hover:bg-due/10 active:scale-98 transition-all text-left"
              >
                <LogOut className="w-4 h-4 text-due" />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Foreground Notification Floating Banner */}
      {foregroundBanner && (
        <div className="fixed top-16 left-4 right-4 z-40 max-w-md mx-auto animate-in slide-in-from-top duration-200">
          <div className="bg-white/95 backdrop-blur-md border border-blue-200 rounded-2xl p-3.5 shadow-lg flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <p className="font-headline font-bold text-xs text-slate-900">{foregroundBanner.title}</p>
                <p className="text-[11px] text-slate-600 mt-0.5">{foregroundBanner.body}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setForegroundBanner(null)}
              className="p-1 text-slate-400 hover:text-slate-600"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area (with padding for fixed top bar & fixed bottom bar) */}
      <main className="flex-1 w-full max-w-md mx-auto pt-16 pb-24">
        {tab === 'today' && (
          <Today
            uid={user.uid}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
        )}
        {tab === 'prices' && <Prices uid={user.uid} />}
        {tab === 'summary' && (
          <Summary
            uid={user.uid}
            onSelectDate={handleSelectDateAndEdit}
          />
        )}
      </main>

      {/* Docked Navigation Tabs */}
      <NavTabs active={tab} onChange={setTab} activeTab={tab} onSelectTab={setTab} />

      {/* In-App Notification Center Drawer */}
      <NotificationDrawer
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        uid={user.uid}
        todayEntry={todayEntry}
        onNavigateToToday={() => {
          setSelectedDate(todayStr())
          setTab('today')
        }}
      />
    </div>
  )
}
