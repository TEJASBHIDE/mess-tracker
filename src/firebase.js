import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Your web app's Firebase configuration
// (safe to keep here — real access control lives in Firestore security rules,
// not in hiding this object)
const firebaseConfig = {
  apiKey: 'AIzaSyC_KV6gzSMC99BQRxYi6hwxu_1KNecL77M',
  authDomain: 'mess-tracker-8ff02.firebaseapp.com',
  projectId: 'mess-tracker-8ff02',
  storageBucket: 'mess-tracker-8ff02.firebasestorage.app',
  messagingSenderId: '714498279682',
  appId: '1:714498279682:web:c4802800c171f9def81a1b',
  measurementId: 'G-EHCXNY9B66'
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export const db = getFirestore(app)
