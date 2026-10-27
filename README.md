# Mess Tracker

Minimal PWA to track daily mess meals (breakfast/lunch/dinner) with dynamic
pricing and a configurable monthly billing cycle. Built with React + Vite +
Firebase (Auth + Firestore), synced across devices via your Google sign-in.

## Run it locally

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). Sign in with Google,
and you're in.

## Before it works: two things in the Firebase console

1. **Authorize localhost** — Firebase Console → Authentication → Settings →
   Authorized domains → check `localhost` is listed (it usually is by
   default).
2. **Security rules** — make sure Firestore → Rules match this (locks each
   user to their own data):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

## How it works

- **Meals** tab — navigate to any date (Today, Yesterday, or pick any past date with the date picker) and tap breakfast/lunch/dinner to mark what you ate. Saves instantly to `users/{uid}/dailyEntries/{date}` with real-time meal prices and day totals.
- **Prices** tab — add new meal prices, edit existing ones, or delete accidental entries. History keeps full pricing with effective dates.
- **Summary** tab — shows the running total for your active billing cycle (e.g. 21st to 30th). Features interactive B / L / D quick-toggles on every day so you can backfill or correct past meals in one tap.

## Deploy it (so you can use it from your phone)

```bash
npm run build
firebase deploy
```

You'll get a live URL like `https://mess-tracker-8ff02.web.app` — open it
on your phone's browser and "Add to Home Screen" to use it like an app.

## Notes / things you may want to add later

- Two people sharing one mess bill: right now data is per Google account.
  If you want a shared household view, that needs a small restructure
  (a shared `messId` instead of per-user data) — ask if you want this added.
- No offline queueing yet — if you're offline when you tap a meal, the save
  will fail with an alert rather than silently retrying later.
>>>>>>> 87317ba (Initial commit: Mess Tracker with Modern Blue theme, UPI payments, and PWA support)
