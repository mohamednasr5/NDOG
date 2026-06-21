// claim.js - نظام المطالبة
import { db } from './firebase.js';
import { ref, get, set, update, push } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { getUserData, updateUser } from './auth.js';
import { showToast } from './ui.js';

let uid = null;

export function initClaimSystem(userId) {
  uid = userId;
  const btn = document.getElementById('claimBtn');
  if (!btn) return;
  btn.addEventListener('click', handleClaim);
  loadClaimStatus();
}

async function loadClaimStatus() {
  if (!uid) return;
  const claimsRef = ref(db, `claims/${uid}`);
  const snap = await get(claimsRef);
  const data = snap.val() || {};
  const lastClaim = data.lastClaim || 0;
  const streak = data.streak || 0;
  const now = Date.now();
  const diff = now - lastClaim;
  const cooldown = 24 * 60 * 60 * 1000;

  // تحديث العرض
  const ringFg = document.getElementById('claimRingFg');
  const hint = document.getElementById('claimHint');
  const reward = document.getElementById('claimReward');
  const btn = document.getElementById('claimBtn');

  if (diff < cooldown) {
    const remaining = cooldown - diff;
    const progress = 1 - (remaining / cooldown);
    ringFg.style.strokeDashoffset = 628 * (1 - progress);
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    hint.textContent = `⏳ انتظر ${hours}h ${mins}m`;
    btn.disabled = true;
  } else {
    ringFg.style.strokeDashoffset = 0;
    hint.textContent = '✅ جاهز للمطالبة';
    btn.disabled = false;
  }

  // تحديث السلسلة
  document.getElementById('claimStreak').textContent = `${streak} days`;
  const mult = streak >= 30 ? 3.0 : streak >= 14 ? 2.0 : streak >= 7 ? 1.5 : 1.0;
  document.getElementById('claimMult').textContent = `×${mult}`;
  reward.textContent = `+${Math.floor(10 * mult)} NDOG`;
}

async function handleClaim() {
  if (!uid) return;
  const btn = document.getElementById('claimBtn');
  btn.disabled = true;
  btn.textContent = '⏳ جارٍ المطالبة...';

  try {
    const userData = await getUserData(uid);
    const claimsRef = ref(db, `claims/${uid}`);
    const snap = await get(claimsRef);
    const data = snap.val() || {};
    const lastClaim = data.lastClaim || 0;
    const now = Date.now();

    if (now - lastClaim < 24 * 60 * 60 * 1000) {
      showToast('لقد طالبت اليوم بالفعل!', 'error');
      btn.disabled = false;
      btn.textContent = 'طالب مكافأتك اليومية';
      return;
    }

    // حساب المكافأة
    const streak = data.streak || 0;
    const newStreak = lastClaim > 0 && (now - lastClaim < 48 * 60 * 60 * 1000) ? streak + 1 : 1;
    const mult = newStreak >= 30 ? 3.0 : newStreak >= 14 ? 2.0 : newStreak >= 7 ? 1.5 : 1.0;
    const baseReward = 10;
    const founderBonus = userData.createdAt < new Date('2028-01-01').getTime() ? 1.5 : 1.0;
    const reward = Math.floor(baseReward * mult * founderBonus);

    // تحديث قاعدة البيانات
    await update(claimsRef, {
      lastClaim: now,
      streak: newStreak,
      totalClaims: (data.totalClaims || 0) + 1
    });
    await updateUser(uid, {
      balance: (userData.balance || 0) + reward,
      communityScore: (userData.communityScore || 0) + Math.floor(reward / 2)
    });

    // تسجيل المعاملة
    await push(ref(db, 'transactions'), {
      uid: uid,
      type: 'claim',
      amount: reward,
      streak: newStreak,
      time: now
    });

    showToast(`🎉 حصلت على ${reward} NDOG!`, 'success');
    loadClaimStatus();
    // تحديث الرصيد في الأعلى
    const newBal = (userData.balance || 0) + reward;
    document.getElementById('topbarBalNum').textContent = newBal.toLocaleString();

  } catch (e) {
    showToast('حدث خطأ: ' + e.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'طالب مكافأتك اليومية';
}