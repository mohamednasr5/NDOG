// analytics.js - الإحصائيات والتحليلات (للمسؤول)
import { db } from './firebase.js';
import { ref, get, update, push, onValue } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// تحديث الإحصائيات عند حدوث أحداث (مثل المطالبة، الإحالة، إلخ)
export async function trackEvent(eventType, data = {}) {
  const analyticsRef = ref(db, 'analytics');
  const snap = await get(analyticsRef);
  const current = snap.val() || {};

  // تحديث العدادات
  if (eventType === 'claim') {
    current.totalClaims = (current.totalClaims || 0) + 1;
    current.totalDistributed = (current.totalDistributed || 0) + (data.amount || 0);
  } else if (eventType === 'referral') {
    current.totalReferrals = (current.totalReferrals || 0) + 1;
  } else if (eventType === 'user') {
    current.totalUsers = (current.totalUsers || 0) + 1;
  }

  await update(analyticsRef, current);
}

// تحميل الإحصائيات (للمسؤول)
export async function getAnalytics() {
  const snap = await get(ref(db, 'analytics'));
  return snap.val() || {};
}

// الاستماع للتحديثات في الوقت الفعلي (للوحة المسؤول)
export function listenAnalytics(callback) {
  return onValue(ref(db, 'analytics'), (snap) => {
    callback(snap.val() || {});
  });
}