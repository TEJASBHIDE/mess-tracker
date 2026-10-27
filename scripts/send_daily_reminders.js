import admin from 'firebase-admin'
import fs from 'fs'

async function run() {
  console.log('🔔 [Daily Reminder] Starting daily meal reminder job...')

  // 1. Authenticate with Firebase Admin SDK using service account
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!rawServiceAccount) {
    console.error('❌ Error: FIREBASE_SERVICE_ACCOUNT environment variable is not set.')
    process.exit(1)
  }

  let serviceAccount
  try {
    // Attempt parsing as JSON string directly
    serviceAccount = JSON.parse(rawServiceAccount)
  } catch {
    // If passed as a file path
    try {
      const fileData = fs.readFileSync(rawServiceAccount, 'utf8')
      serviceAccount = JSON.parse(fileData)
    } catch (e) {
      console.error('❌ Error: Could not parse FIREBASE_SERVICE_ACCOUNT as JSON or file path.', e)
      process.exit(1)
    }
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || 'mess-tracker-8ff02'
  })

  const db = admin.firestore()
  const messaging = admin.messaging()

  // 2. Compute today's date in Indian Standard Time (IST)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const todayStr = formatter.format(new Date()) // Returns 'YYYY-MM-DD'
  console.log(`📅 Target Date (IST): ${todayStr}`)

  // 3. Find all users who have notifications enabled
  // We check collectionGroup('settings') where doc.id === 'notifications'
  const settingsSnap = await db.collectionGroup('settings').get()
  const candidateDocs = settingsSnap.docs.filter((d) => d.id === 'notifications')

  console.log(`👥 Found ${candidateDocs.length} user notification settings documents.`)

  let notificationsSent = 0
  let usersSkipped = 0

  for (const docSnap of candidateDocs) {
    const settings = docSnap.data()
    // docSnap.ref.parent is collection('settings'), parent.parent is doc('users/{uid}')
    const uid = docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : null

    if (!uid) {
      continue
    }

    if (settings.enabled === false) {
      console.log(`⏭️ User ${uid}: Reminders disabled by user preference. Skipping.`)
      usersSkipped++
      continue
    }

    const rawTokens = Array.isArray(settings.fcmTokens) ? settings.fcmTokens : []
    const tokens = rawTokens
      .map((t) => (typeof t === 'string' ? t : t.token))
      .filter(Boolean)

    if (tokens.length === 0) {
      console.log(`ℹ️ User ${uid}: Reminders enabled, but no active device push tokens registered.`)
      usersSkipped++
      continue
    }

    // 4. Check today's meal entry
    const entryRef = db.doc(`users/${uid}/dailyEntries/${todayStr}`)
    const entrySnap = await entryRef.get()
    const entry = entrySnap.exists ? entrySnap.data() : null

    // Smart Meal Rule: If dinner is already checked, user completed their evening log!
    if (entry && entry.dinner === true) {
      console.log(`✅ User ${uid}: Dinner already logged for ${todayStr}. Skipping notification.`)
      usersSkipped++
      continue
    }

    // Determine notification message
    let body = "You haven't logged any meals for today. Don't forget to update your mess log!"
    if (entry && (entry.breakfast === true || entry.lunch === true)) {
      body = 'Did you have dinner tonight? Tap to mark your dinner in Mess Tracker.'
    }

    const title = 'Mess Tracker — Evening Reminder'
    const clickUrl = 'https://mess-tracker-8ff02.web.app/?tab=today'

    console.log(`📲 User ${uid}: Sending reminder to ${tokens.length} device(s)...`)

    // 5. Send FCM Multicast Push
    try {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title,
          body
        },
        data: {
          url: '/?tab=today',
          date: todayStr
        },
        webpush: {
          headers: {
            Urgency: 'high'
          },
          notification: {
            title,
            body,
            icon: 'https://mess-tracker-8ff02.web.app/logo-primary.png',
            badge: 'https://mess-tracker-8ff02.web.app/favicon.svg',
            tag: 'mess-tracker-daily-reminder',
            data: {
              url: '/?tab=today'
            }
          },
          fcmOptions: {
            link: clickUrl
          }
        }
      })

      console.log(
        `   ↳ Delivery summary: ${response.successCount} succeeded, ${response.failureCount} failed.`
      )
      notificationsSent += response.successCount

      // 6. Handle expired/unregistered tokens cleanup
      if (response.failureCount > 0) {
        const deadTokens = []
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code
            console.warn(`   ⚠️ Token #${idx} error: ${errCode || resp.error?.message}`)
            if (
              errCode === 'messaging/registration-token-not-registered' ||
              errCode === 'messaging/invalid-registration-token'
            ) {
              deadTokens.push(tokens[idx])
            }
          }
        })

        if (deadTokens.length > 0) {
          console.log(`   🧹 Cleaning up ${deadTokens.length} dead token(s) from Firestore...`)
          const cleaned = rawTokens.filter((item) => {
            const t = typeof item === 'string' ? item : item.token
            return !deadTokens.includes(t)
          })
          await docSnap.ref.update({ fcmTokens: cleaned })
        }
      }
    } catch (sendErr) {
      console.error(`❌ User ${uid}: Failed to send FCM message:`, sendErr)
    }
  }

  console.log('\n=======================================')
  console.log(`🎉 Job Complete!`)
  console.log(`   Total notifications delivered: ${notificationsSent}`)
  console.log(`   Total users skipped: ${usersSkipped}`)
  console.log('=======================================\n')
}

run().catch((err) => {
  console.error('Fatal error in daily reminder job:', err)
  process.exit(1)
})
