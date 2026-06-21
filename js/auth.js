// auth.js - المصادقة وإدارة المستخدمين
import { auth, db, provider } from './firebase.js';
import { signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { getDeviceFingerprint } from './security.js';

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const userRef = ref(db, `users/${user.uid}`);
    const snap = await get(userRef);
    const fp = await getDeviceFingerprint();
    if (!snap.exists()) {
      const referralCode = 'NDOG' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const referredBy = new URLSearchParams(window.location.search).get('ref') || '';
      await set(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'مستخدم',
        photoURL: user.photoURL || '',
        referralCode: referralCode,
        referredBy: referredBy,
        balance: 0,
        stakingBalance: 0,
        loyaltyScore: 0,
        communityScore: 0,
        totalClaims: 0,
        totalReferrals: 0,
        rank: 'bronze',
        badges: ['early_adopter'],
        createdAt: Date.now(),
        lastLogin: Date.now(),
        banned: false,
        role: 'user',
        deviceFingerprint: fp
      });
      // معالجة الإحالة إذا وجدت
      if (referredBy) {
        import('./referrals.js').then(({ processReferral }) => {
          processReferral(user.uid, referredBy);
        });
      }
    } else {
      await update(userRef, { lastLogin: Date.now() });
    }
    return user;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

export function logout() {
  return signOut(auth);
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getUserData(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.val();
}

export async function getUserRole(uid) {
  const data = await getUserData(uid);
  return data?.role || 'user';
}

export async function updateUser(uid, data) {
  await update(ref(db, `users/${uid}`), data);
}

export async function isUserBanned(uid) {
  const data = await getUserData(uid);
  return data?.banned === true;
}