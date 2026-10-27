import { useEffect, useState, useRef } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase'
import Login from './components/Login'
import NavTabs from './components/NavTabs'
import Today from './components/Today'
import Prices from './components/Prices'
import Summary from './components/Summary'
import Logo from './components/Logo'
import { Bell, LogOut } from 'lucide-react'
import { todayStr } from './lib/dateUtils'

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = checking, null = signed out
  const [tab, setTab] = useState('today')
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const profileMenuRef = useRef(null)

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u))
  }, [])

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
            aria-label="Notifications"
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all"
            title="No new notifications"
          >
            <Bell className="w-5 h-5 text-slate-600" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-white"></span>
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
                onClick={() => {
                  setShowProfileMenu(false)
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
    </div>
  )
}
