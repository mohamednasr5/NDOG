// staking.js - نظام التخزين
import { db } from './firebase.js';
import { ref, get, update, set } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { getUserData, updateUser } from './auth.js';
import { showToast } from './ui.js';

let uid = null;

export function initStaking(userId) {
  uid = userId;
  loadStakingPools();
}

const pools = [
  { days: 30, apr: 5, label: '30 يوم' },
  { days: 90, apr: 10, label: '90 يوم' },
  { days: 180, apr: 15, label: '180 يوم' },
  { days: 365, apr: 25, label: '365 يوم' }
];

async function loadStakingPools() {
  if (!uid) return;
  const container = document.getElementById('stakePools');
  if (!container) return;

  const userData = await getUserData(uid);
  const stakingRef = ref(db, `staking/${uid}`);
  const snap = await get(stakingRef);
  const stakes = snap.val() || {};

  const html = pools.map(p => {
    const userStake = stakes[p.days] || 0;
    return `
      <div class="pool-card glass" style="padding:16px;margin-bottom:12px;">
        <div><strong>${p.label}</strong> — APR: <span style="color:#2ecc71;">${p.apr}%</span></div>
        <div>مخزونك: ${userStake} NDOG</div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <input type="number" id="stake-amount-${p.days}" placeholder="المبلغ" style="flex:1;padding:8px;border-radius:12px;border:1px solid rgba(255,215,0,0.3);background:rgba(255,255,255,0.05);color:#fff;" />
          <button class="btn btn--gold btn--sm stake-btn" data-days="${p.days}">تخزين</button>
          <button class="btn btn--ghost btn--sm unstake-btn" data-days="${p.days}">سحب</button>
        </div>
      </div>
    `;
  }).join('');
  container.innerHTML = html;

  // أحداث التخزين
  container.querySelectorAll('.stake-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const days = parseInt(btn.dataset.days);
      const amountInput = document.getElementById(`stake-amount-${days}`);
      const amount = parseFloat(amountInput.value);
      if (!amount || amount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }
      await handleStake(days, amount);
    });
  });

  // أحداث السحب
  container.querySelectorAll('.unstake-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const days = parseInt(btn.dataset.days);
      await handleUnstake(days);
    });
  });
}

async function handleStake(days, amount) {
  if (!uid) return;
  const userData = await getUserData(uid);
  if ((userData.balance || 0) < amount) {
    showToast('رصيدك غير كافٍ', 'error');
    return;
  }
  // خصم من الرصيد
  const newBalance = (userData.balance || 0) - amount;
  await updateUser(uid, { balance: newBalance });
  // إضافة إلى التخزين
  const stakingRef = ref(db, `staking/${uid}/${days}`);
  const current = (await get(stakingRef)).val() || 0;
  await set(stakingRef, current + amount);
  showToast(`تم تخزين ${amount} NDOG لمدة ${days} يوم`, 'success');
  loadStakingPools();
}

async function handleUnstake(days) {
  if (!uid) return;
  const stakingRef = ref(db, `staking/${uid}/${days}`);
  const snap = await get(stakingRef);
  const amount = snap.val() || 0;
  if (amount <= 0) { showToast('ليس لديك مخزون في هذه المدة', 'error'); return; }
  // إعادة الرصيد
  const userData = await getUserData(uid);
  const newBalance = (userData.balance || 0) + amount;
  await updateUser(uid, { balance: newBalance });
  // حذف التخزين
  await set(stakingRef, 0);
  showToast(`تم سحب ${amount} NDOG من التخزين`, 'success');
  loadStakingPools();
}