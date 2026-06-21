// referrals.js - نظام الإحالات
import { db } from './firebase.js';
import { ref, get, update, push } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { getUserData, updateUser } from './auth.js';
import { showToast } from './ui.js';

let uid = null;

export function initReferralSystem(userId) {
  uid = userId;
  loadReferralData();
  setupShareButtons();
}

async function loadReferralData() {
  if (!uid) return;
  const userData = await getUserData(uid);
  const refsSnap = await get(ref(db, `referrals/${uid}`));
  const refs = refsSnap.val() || {};

  const total = Object.keys(refs).length;
  const active = Object.values(refs).filter(r => r.claimed > 0).length;
  let earnings = 0;
  Object.values(refs).forEach(r => earnings += (r.bonus || 0));

  document.getElementById('refStatTotal').textContent = total;
  document.getElementById('refStatActive').textContent = active;
  document.getElementById('refStatEarn').textContent = earnings;
  document.getElementById('refStatConv').textContent = total > 0 ? Math.round((active/total)*100) + '%' : '0%';
  document.getElementById('refCodeInput').value = userData.referralCode || '';
  document.getElementById('refLinkInput').value = `https://ndogcoin.com/?ref=${userData.referralCode || ''}`;

  // شجرة الإحالات
  const tree = document.getElementById('refTreeList');
  const entries = Object.entries(refs).slice(-50).reverse();
  if (entries.length === 0) {
    tree.innerHTML = '<div class="empty">لا توجد إحالات بعد.</div>';
  } else {
    tree.innerHTML = entries.map(([key, r]) => `
      <div class="ref-tree-item" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span>👤 ${r.name || 'مجهول'}</span>
        <span style="color:#ffd700;">L${r.level || 1} +${r.bonus || 0} NDOG</span>
      </div>
    `).join('');
  }
}

export async function processReferral(newUid, referrerCode) {
  // يتم استدعاؤها عند تسجيل مستخدم جديد
  if (!referrerCode) return;
  const usersSnap = await get(ref(db, 'users'));
  const users = usersSnap.val() || {};
  let referrerId = null;
  for (const [id, u] of Object.entries(users)) {
    if (u.referralCode === referrerCode) {
      referrerId = id;
      break;
    }
  }
  if (!referrerId || referrerId === newUid) return;

  // إضافة الإحالة (المستوى 1)
  const newUser = users[newUid];
  await push(ref(db, `referrals/${referrerId}`), {
    uid: newUid,
    name: newUser.displayName || 'مستخدم',
    level: 1,
    bonus: 50,
    claimed: 0,
    date: Date.now()
  });
  // تحديث رصيد المُحيل
  const refData = await getUserData(referrerId);
  await updateUser(referrerId, {
    balance: (refData.balance || 0) + 50,
    totalReferrals: (refData.totalReferrals || 0) + 1
  });
  showToast(`🎉 ربحت 50 NDOG من إحالة جديدة!`, 'success');
}