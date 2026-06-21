/* ============================================================
   NileDogs (NDOG) — Crypto Rewards Platform
   Vanilla JS · Firebase v8 Compat SDK
   ============================================================ */

// ─── 1. State ────────────────────────────────────────────────
let currentUser = null;
let userData = null;
let currentLang = localStorage.getItem('ndog_lang') || 'ar';
let selectedPlan = '7_days';
let isSpinning = false;
let cooldownInterval = null;

// ─── 2. Constants ────────────────────────────────────────────
const VIP_TIERS = {
  bronze:   { min: 0,      mult: 1,   label_ar: 'برونزي', label_en: 'Bronze',  emoji: '🥉' },
  silver:   { min: 1000,   mult: 1.2, label_ar: 'فضي',   label_en: 'Silver',  emoji: '🥈' },
  gold:     { min: 5000,   mult: 1.5, label_ar: 'ذهبي',   label_en: 'Gold',    emoji: '🥇' },
  platinum: { min: 20000,  mult: 2,   label_ar: 'بلاتيني', label_en: 'Platinum', emoji: '💎' },
  diamond:  { min: 100000, mult: 3,   label_ar: 'ماسي',   label_en: 'Diamond',  emoji: '💠' }
};
const STREAK_MULTIPLIERS = { 2: 1.2, 3: 1.5, 5: 1.8, 7: 2, 14: 2.5, 30: 3 };
const BASE_REWARD = 10;
const WHEEL_PRIZES = [5, 10, 15, 20, 25, 50, 75, 100];
const WHEEL_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#8b5cf6','#ec4899','#f59e0b'];
const STAKING_PLANS = {
  '7_days':   { apr: 0.05, days: 7,   min: 100  },
  '30_days':  { apr: 0.10, days: 30,  min: 500  },
  '90_days':  { apr: 0.18, days: 90,  min: 1000 },
  '180_days': { apr: 0.25, days: 180, min: 2000 }
};
const REFERRAL_BONUSES = { 1: 50, 2: 20, 3: 10 };

// ─── 3. Helper Functions ─────────────────────────────────────

function t(arText, enText) {
  return currentLang === 'ar' ? arText : enText;
}

function toggleLang() {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('ndog_lang', currentLang);
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-ar]').forEach(el => {
    el.textContent = el.getAttribute('data-' + currentLang);
  });
  if (userData) renderDashboard();
}

function showToast(message, type = 'info') {
  const colors = { info: '#3b82f6', success: '#22c55e', error: '#ef4444', warning: '#f59e0b' };
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:10000;
    padding:12px 24px;border-radius:12px;color:#fff;font-size:14px;font-weight:600;
    background:${colors[type] || colors.info};box-shadow:0 4px 20px rgba(0,0,0,.3);
    opacity:0;transition:opacity .3s;max-width:90%;text-align:center;`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.style.opacity = '1');
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function showLoading() {
  if (document.getElementById('global-loading')) return;
  const ov = document.createElement('div');
  ov.id = 'global-loading';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);';
  ov.innerHTML = '<div style="width:48px;height:48px;border:4px solid #fff3;border-top-color:#3b82f6;border-radius:50%;animation:spin .8s linear infinite;"></div>';
  document.body.appendChild(ov);
}

function hideLoading() {
  const el = document.getElementById('global-loading');
  if (el) el.remove();
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US');
}

function getVipTier(balance) {
  const bal = Number(balance) || 0;
  let tier = VIP_TIERS.bronze;
  for (const key in VIP_TIERS) {
    if (bal >= VIP_TIERS[key].min) tier = VIP_TIERS[key];
  }
  return tier;
}

function getStreakMultiplier(streak) {
  let mult = 1;
  for (const days in STREAK_MULTIPLIERS) {
    if (streak >= Number(days)) mult = STREAK_MULTIPLIERS[days];
  }
  return mult;
}

// ─── 4. Authentication ───────────────────────────────────────

function loginGoogle() {
  showLoading();
  auth.signInWithPopup(googleProvider)
    .catch(err => {
      hideLoading();
      if (err.code === 'auth/popup-blocked') {
        showToast(t('يرجى السماح بالنوافذ المنبثقة للمتصفح', 'Please allow popups in your browser'), 'warning');
      } else {
        showToast(t('فشل تسجيل الدخول', 'Login failed'), 'error');
      }
    });
}

function logout() {
  const msg = t('هل تريد تسجيل الخروج؟', 'Are you sure you want to logout?');
  if (!confirm(msg)) return;
  if (cooldownInterval) clearInterval(cooldownInterval);
  auth.signOut();
}

auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    initUserData(user);
  } else {
    currentUser = null;
    userData = null;
    const app = document.getElementById('mainApp');
    const login = document.getElementById('loginScreen');
    if (app) app.style.display = 'none';
    if (login) login.style.display = 'flex';
    if (cooldownInterval) { clearInterval(cooldownInterval); cooldownInterval = null; }
  }
});

// ─── 5. User Init ────────────────────────────────────────────

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function initUserData(user) {
  db.ref('users/' + user.uid).once('value').then(snap => {
    if (snap.exists()) {
      userData = snap.val();
      userData.uid = user.uid;
      showApp();
    } else {
      const refCode = generateReferralCode();
      const now = firebase.database.ServerValue.TIMESTAMP;
      const profile = {
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        balance: 0,
        streak: 0,
        lastClaimAt: 0,
        totalClaimed: 0,
        referralCode: refCode,
        referredBy: null,
        founder: true,
        vipLevel: 'bronze',
        createdAt: now
      };
      const updates = {};
      updates['users/' + user.uid] = profile;
      updates['referralCodes/' + refCode] = { uid: user.uid, createdAt: now };
      db.ref().update(updates).then(() => {
        userData = { ...profile, uid: user.uid };
        // Auto-apply referral code from URL
        const savedRef = localStorage.getItem('ndog_ref');
        if (savedRef) {
          applyReferralCode(savedRef).finally(() => {
            localStorage.removeItem('ndog_ref');
            showApp();
          });
        } else {
          showApp();
        }
      }).catch(err => {
        hideLoading();
        showToast(t('فشل إنشاء الحساب', 'Failed to create account'), 'error');
        console.error(err);
      });
    }
  }).catch(err => {
    hideLoading();
    showToast(t('خطأ في تحميل البيانات', 'Error loading data'), 'error');
    console.error(err);
  });
}

function showApp() {
  hideLoading();
  const app = document.getElementById('mainApp');
  const login = document.getElementById('loginScreen');
  if (login) login.style.display = 'none';
  if (app) app.style.display = 'block';
  switchTab('Dashboard');
  renderDashboard();
  updateClaimCooldown();
  loadNews();
  loadFaq();
  loadAirdropInfo();
  loadStakingContracts();
  loadReferralCount();
  // Real-time listener for balance changes
  db.ref('users/' + currentUser.uid).on('value', snap => {
    if (snap.exists()) {
      userData = { ...snap.val(), uid: currentUser.uid };
      renderDashboard();
    }
  });
}

// ─── 6. Dashboard ────────────────────────────────────────────

function renderDashboard() {
  if (!userData) return;
  const bal = userData.balance || 0;
  const streak = userData.streak || 0;
  const vip = getVipTier(bal);
  const vipLabel = currentLang === 'ar' ? vip.label_ar : vip.label_en;

  setEl('dashBalance', formatNumber(bal));
  setEl('dashStreak', streak);
  setEl('dashTotalClaimed', formatNumber(userData.totalClaimed || 0));
  setEl('dashVip', vip.emoji + ' ' + vipLabel);
  setEl('dashFounder', userData.founder ? t('🚀 مؤسس', '🚀 Founder') : '');
  setEl('headerName', userData.displayName || (currentUser ? currentUser.displayName : ''));
  setEl('headerBalance', formatNumber(bal) + ' NDOG');

  const mult = getStreakMultiplier(streak) * vip.mult * (userData.founder ? 1.1 : 1);
  setEl('dash-multiplier', 'x' + mult.toFixed(2));

  const avail = Number(userData.balance) || 0;
  setEl('stakingAvail', formatNumber(avail));
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── 7. Daily Claim ──────────────────────────────────────────

function claimDaily() {
  if (!currentUser || !userData) return;
  const now = Date.now();
  const last = userData.lastClaimAt || 0;
  const diff = now - last;
  const COOLDOWN = 24 * 60 * 60 * 1000;

  if (diff < COOLDOWN) {
    const remain = Math.ceil((COOLDOWN - diff) / 60000);
    showToast(t(`انتظر ${remain} دقيقة`, `Wait ${remain} minutes`), 'warning');
    return;
  }

  showLoading();
  const vip = getVipTier(userData.balance);
  // Check streak gap
  let streak = userData.streak || 0;
  if (last > 0 && diff > 2 * COOLDOWN) streak = 0;
  streak++;

  const streakMult = getStreakMultiplier(streak);
  const founderMult = userData.founder ? 1.1 : 1;
  const totalMult = vip.mult * streakMult * founderMult;
  const reward = Math.round(BASE_REWARD * totalMult * 100) / 100;
  const claimId = db.ref().child('claims').push().key;
  const txId = db.ref().child('transactions').push().key;
  const ts = firebase.database.ServerValue.TIMESTAMP;

  const updates = {};
  updates['claims/' + claimId] = { uid: currentUser.uid, amount: reward, ts: ts, type: 'daily' };
  updates['transactions/' + txId] = { uid: currentUser.uid, amount: reward, ts: ts, type: 'claim_daily' };

  db.ref('users/' + currentUser.uid).transaction(data => {
    if (!data) return data;
    data.balance = (Number(data.balance) || 0) + reward;
    data.streak = streak;
    data.lastClaimAt = ts;
    data.totalClaimed = (Number(data.totalClaimed) || 0) + reward;
    return data;
  }).then(result => {
    hideLoading();
    if (result.committed) {
      db.ref().update(updates);
      userData.lastClaimAt = Date.now();
      updateClaimCooldown();
      showToast(t(`تم المطالبة بـ ${reward} NDOG!`, `Claimed ${reward} NDOG!`), 'success');
    } else {
      showToast(t('فشل المطالبة، حاول مجدداً', 'Claim failed, try again'), 'error');
    }
  }).catch(err => {
    hideLoading();
    showToast(t('خطأ في المطالبة', 'Claim error'), 'error');
    console.error(err);
  });
}

function updateClaimCooldown() {
  if (cooldownInterval) clearInterval(cooldownInterval);
  function check() {
    const timer = document.getElementById('claimTimer');
    const btn = document.getElementById('claimBtn');
    if (!userData || !userData.lastClaimAt) {
      if (btn) btn.disabled = false;
      if (timer) timer.style.display = 'none';
      return;
    }
    const diff = Date.now() - (userData.lastClaimAt || 0);
    const remain = 24 * 60 * 60 * 1000 - diff;
    if (remain <= 0) {
      if (btn) btn.disabled = false;
      if (timer) timer.style.display = 'none';
    } else {
      if (btn) btn.disabled = true;
      if (timer) {
        timer.style.display = 'inline';
        const h = Math.floor(remain / 3600000);
        const m = Math.floor((remain % 3600000) / 60000);
        const s = Math.floor((remain % 60000) / 1000);
        timer.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      }
    }
  }
  check();
  cooldownInterval = setInterval(check, 1000);
}

// ─── 8. Spin Wheel ───────────────────────────────────────────

function buildWheel() {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const center = size / 2;
  const radius = center - 4;
  const segAngle = (2 * Math.PI) / WHEEL_PRIZES.length;

  ctx.clearRect(0, 0, size, size);
  WHEEL_PRIZES.forEach((prize, i) => {
    const start = i * segAngle - Math.PI / 2;
    const end = start + segAngle;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = WHEEL_COLORS[i];
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Prize text
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(start + segAngle / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(prize + ' NDOG', radius - 12, 5);
    ctx.restore();
  });
  // Center circle
  ctx.beginPath();
  ctx.arc(center, center, 22, 0, 2 * Math.PI);
  ctx.fillStyle = '#1e293b';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NDOG', center, center + 4);
}

function spinWheel() {
  if (isSpinning) return;
  if (!currentUser || !userData) return;
  const lastWheel = userData.lastWheelSpinAt || 0;
  if (Date.now() - lastWheel < 24 * 60 * 60 * 1000) {
    showToast(t('يمكنك الدوران مرة كل 24 ساعة', 'You can spin once every 24 hours'), 'warning');
    return;
  }
  isSpinning = true;
  const prizeIndex = Math.floor(Math.random() * WHEEL_PRIZES.length);
  const prize = WHEEL_PRIZES[prizeIndex];
  const segAngle = 360 / WHEEL_PRIZES.length;
  const targetAngle = 360 - (prizeIndex * segAngle + segAngle / 2);
  const totalRotation = 1440 + targetAngle;

  const wheel = document.getElementById('spinWheel');
  if (wheel) wheel.style.transform = `rotate(${totalRotation}deg)`;

  setTimeout(() => {
    addBalance(prize, 'wheel_spin').then(() => {
      db.ref('users/' + currentUser.uid + '/lastWheelSpinAt').set(firebase.database.ServerValue.TIMESTAMP);
      const txId = db.ref().child('transactions').push().key;
      db.ref('transactions/' + txId).set({
        uid: currentUser.uid, amount: prize, ts: firebase.database.ServerValue.TIMESTAMP, type: 'wheel_spin'
      });
      const spinId = db.ref().child('wheelSpins').push().key;
      db.ref('wheelSpins/' + spinId).set({
        uid: currentUser.uid, prize: prize, ts: firebase.database.ServerValue.TIMESTAMP
      });
      showToast(t(`فزت بـ ${prize} NDOG!`, `You won ${prize} NDOG!`), 'success');
    });
    isSpinning = false;
  }, 4500);
}

// ─── 9. Mini Games ───────────────────────────────────────────

function playLuckyBox() {
  if (!currentUser) return;
  const prize = Math.floor(Math.random() * 96) + 5; // 5-100
  showLoading();
  addBalance(prize, 'lucky_box').then(() => {
    hideLoading();
    showToast(t(`حصلت على ${prize} NDOG من الصندوق!`, `Got ${prize} NDOG from the box!`), 'success');
  }).catch(() => hideLoading());
}

function playScratchCard() {
  if (!currentUser) return;
  const prize = Math.floor(Math.random() * 196) + 5; // 5-200
  showLoading();
  addBalance(prize, 'scratch_card').then(() => {
    hideLoading();
    showToast(t(`كشط بطاقة: ${prize} NDOG!`, `Scratch card: ${prize} NDOG!`), 'success');
  }).catch(() => hideLoading());
}

function addBalance(amount, type) {
  return db.ref('users/' + currentUser.uid).transaction(data => {
    if (!data) return data;
    data.balance = (Number(data.balance) || 0) + amount;
    return data;
  }).then(result => {
    if (result.committed) {
      const txId = db.ref().child('transactions').push().key;
      return db.ref('transactions/' + txId).set({
        uid: currentUser.uid, amount: amount, ts: firebase.database.ServerValue.TIMESTAMP, type: type
      });
    }
    return Promise.reject('Transaction not committed');
  });
}

// ─── 10. Missions ────────────────────────────────────────────

function loadMissions() {
  db.ref('missions').once('value').then(snap => {
    const data = snap.val() || {};
    const containers = { daily: 'dailyMissionsList', weekly: 'weeklyMissionsList', monthly: 'monthlyMissionsList' };
    for (const type in containers) {
      renderMissions(containers[type], data[type] || {});
    }
  });
}

function renderMissions(containerId, missions) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  for (const id in missions) {
    const m = missions[id];
    const item = document.createElement('div');
    item.className = 'mission-item';
    item.style.cssText = 'padding:12px;margin:8px 0;border-radius:10px;background:rgba(255,255,255,.06);';
    const title = currentLang === 'ar' ? (m.title_ar || m.title) : (m.title_en || m.title);
    const desc = currentLang === 'ar' ? (m.desc_ar || m.desc || '') : (m.desc_en || m.desc || '');
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:600;color:#fff;">${title}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:4px;">${desc}</div>
          <div style="font-size:13px;color:#f59e0b;margin-top:4px;">${m.reward} NDOG</div>
        </div>
        <button class="mission-claim-btn" data-mission="${id}" data-reward="${m.reward}" data-type="${containerId}"
          style="padding:8px 16px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer;">
          ${t('مطالبة', 'Claim')}
        </button>
      </div>`;
    container.appendChild(item);
  }
  // Attach click handlers
  container.querySelectorAll('.mission-claim-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      completeMission(btn.dataset.mission, Number(btn.dataset.reward));
    });
  });
}

function completeMission(missionId, reward) {
  if (!currentUser) return;
  const progressRef = db.ref('missionProgress/' + currentUser.uid + '/' + missionId);
  progressRef.once('value').then(snap => {
    if (snap.exists()) {
      showToast(t('تم إكمال هذه المهمة بالفعل', 'Mission already completed'), 'warning');
      return;
    }
    showLoading();
    progressRef.set({ completedAt: firebase.database.ServerValue.TIMESTAMP, reward: reward })
      .then(() => addBalance(reward, 'mission_' + missionId))
      .then(() => {
        hideLoading();
        showToast(t(`تم إكمال المهمة! +${reward} NDOG`, `Mission done! +${reward} NDOG`), 'success');
        loadMissions();
      })
      .catch(err => { hideLoading(); showToast(t('فشل إكمال المهمة', 'Mission failed'), 'error'); });
  });
}

// ─── 11. Staking ─────────────────────────────────────────────

function selectPlan(btn, planId) {
  selectedPlan = planId;
  document.querySelectorAll('.staking-plan-btn').forEach(b => {
    b.style.borderColor = b === btn ? '#3b82f6' : 'transparent';
    b.style.background = b === btn ? 'rgba(59,130,246,.15)' : 'rgba(255,255,255,.05)';
  });
}

function stakeTokens() {
  if (!currentUser || !userData) return;
  const input = document.getElementById('stakeAmount');
  const amount = Number(input ? input.value : 0);
  const plan = STAKING_PLANS[selectedPlan];
  if (!plan) return;
  if (isNaN(amount) || amount <= 0) {
    showToast(t('أدخل مبلغاً صحيحاً', 'Enter a valid amount'), 'warning');
    return;
  }
  if (amount < plan.min) {
    showToast(t(`الحد الأدنى ${plan.min} NDOG`, `Minimum ${plan.min} NDOG`), 'warning');
    return;
  }
  if (amount > (userData.balance || 0)) {
    showToast(t('رصيد غير كافٍ', 'Insufficient balance'), 'error');
    return;
  }
  showLoading();
  const now = Date.now();
  const endDate = now + plan.days * 24 * 60 * 60 * 1000;
  const earnedRewards = Math.round(amount * plan.apr * 100) / 100;
  const contractId = db.ref().child('stakingContracts').push().key;

  // Deduct balance via transaction
  db.ref('users/' + currentUser.uid).transaction(data => {
    if (!data) return data;
    if ((Number(data.balance) || 0) < amount) return; // Abort
    data.balance = (Number(data.balance) || 0) - amount;
    return data;
  }).then(result => {
    if (result.committed) {
      return db.ref('stakingContracts/' + contractId).set({
        uid: currentUser.uid, amount: amount, plan: selectedPlan,
        apr: plan.apr, days: plan.days, earnedRewards: earnedRewards,
        startDate: now, endDate: endDate, status: 'active'
      });
    }
    throw new Error('Transaction aborted');
  }).then(() => {
    hideLoading();
    if (input) input.value = '';
    showToast(t(`تم الستيك بنجاح!`, `Staked successfully!`), 'success');
    loadStakingContracts();
  }).catch(err => {
    hideLoading();
    showToast(t('فشل الستيك', 'Staking failed'), 'error');
    console.error(err);
  });
}

function loadStakingContracts() {
  if (!currentUser) return;
  const container = document.getElementById('contractsList');
  if (!container) return;
  db.ref('stakingContracts').orderByChild('uid').equalTo(currentUser.uid).once('value').then(snap => {
    const contracts = snap.val() || {};
    container.innerHTML = '';
    let hasActive = false;
    for (const cid in contracts) {
      const c = contracts[cid];
      if (c.status !== 'active') continue;
      hasActive = true;
      const daysLeft = Math.max(0, Math.ceil((c.endDate - Date.now()) / 86400000));
      const isMature = daysLeft <= 0;
      const item = document.createElement('div');
      item.className = 'staking-contract-item';
      item.style.cssText = 'padding:12px;margin:8px 0;border-radius:10px;background:rgba(255,255,255,.06);';
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="color:#fff;font-weight:600;">${formatNumber(c.amount)} NDOG — ${c.plan}</div>
            <div style="color:#94a3b8;font-size:12px;margin-top:4px;">
              ${isMature ? t('✅ ناضج - يمكن الفك', '✅ Mature - Ready to unstake') :
                t(`⏳ متبقي ${daysLeft} يوم | مكافأة: ${c.earnedRewards} NDOG`,
                  `⏳ ${daysLeft} days left | Reward: ${c.earnedRewards} NDOG`)}
            </div>
          </div>
          ${isMature ? `<button onclick="unstake(${c.endDate},${c.amount},${c.earnedRewards},'${cid}')"
            style="padding:8px 16px;border:none;border-radius:8px;background:#22c55e;color:#fff;font-weight:600;cursor:pointer;">
            ${t('فك الستيك', 'Unstake')}</button>` : ''}
        </div>`;
      container.appendChild(item);
    }
    if (!hasActive) {
      container.innerHTML = `<div style="text-align:center;color:#64748b;padding:24px;">
        ${t('لا توجد عقود ستيك نشطة', 'No active staking contracts')}</div>`;
    }
  });
}

function unstake(endDate, amount, earnedRewards, contractId) {
  if (Date.now() < endDate) {
    showToast(t('لم يحن وقت الفك بعد', 'Not mature yet'), 'warning');
    return;
  }
  showLoading();
  const totalReturn = amount + earnedRewards;
  addBalance(totalReturn, 'unstake').then(() => {
    return db.ref('stakingContracts/' + contractId + '/status').set('completed');
  }).then(() => {
    hideLoading();
    showToast(t(`تم فك الستيك! +${totalReturn} NDOG`, `Unstaked! +${totalReturn} NDOG`), 'success');
    loadStakingContracts();
  }).catch(err => {
    hideLoading();
    showToast(t('فشل فك الستيك', 'Unstaking failed'), 'error');
    console.error(err);
  });
}

// ─── 12. Leaderboard ─────────────────────────────────────────

function loadLeaderboard() {
  const balContainer = document.getElementById('topBalanceList');
  const streakContainer = document.getElementById('topStreakList');
  if (!balContainer || !streakContainer) return;

  db.ref('users').orderByChild('balance').limitToLast(20).once('value').then(snap => {
    const users = [];
    snap.forEach(child => users.push({ ...child.val(), uid: child.key }));
    users.reverse();
    renderLeaderboard('topBalanceList', users, 'balance');
  });

  db.ref('users').orderByChild('streak').limitToLast(10).once('value').then(snap => {
    const users = [];
    snap.forEach(child => users.push({ ...child.val(), uid: child.key }));
    users.reverse();
    renderLeaderboard('topStreakList', users, 'streak');
  });
}

function renderLeaderboard(containerId, users, field) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  users.forEach((u, i) => {
    const rank = i + 1;
    let badge = '';
    if (rank === 1) badge = '🥇';
    else if (rank === 2) badge = '🥈';
    else if (rank === 3) badge = '🥉';
    else badge = `#${rank}`;

    const val = field === 'balance' ? formatNumber(u.balance || 0) + ' NDOG' : (u.streak || 0) + ' ' + t('يوم', 'days');
    const name = u.displayName || t('مستخدم', 'User');
    const isMe = currentUser && u.uid === currentUser.uid;
    const item = document.createElement('div');
    item.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:10px 12px;
      margin:4px 0;border-radius:8px;background:${isMe ? 'rgba(59,130,246,.15)' : 'rgba(255,255,255,.04)'};`;
    item.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;min-width:30px;text-align:center;">${badge}</span>
        <span style="color:#fff;font-weight:${isMe ? '700' : '400'};">${name}${isMe ? ' ⭐' : ''}</span>
      </div>
      <span style="color:#f59e0b;font-weight:600;">${val}</span>`;
    container.appendChild(item);
  });
}

// ─── 13. Referral ────────────────────────────────────────────

function loadReferralCount() {
  if (!currentUser) return;
  db.ref('referrals/' + currentUser.uid).once('value').then(snap => {
    const count = snap.numChildren();
    setEl('referralCount', count);
  });
}

function copyReferralCode() {
  if (!userData) return;
  const code = userData.referralCode || '';
  copyToClipboard(code, t('تم نسخ الكود!', 'Code copied!'));
}

function copyReferralLink() {
  if (!userData) return;
  const link = window.location.origin + window.location.pathname + '?ref=' + (userData.referralCode || '');
  copyToClipboard(link, t('تم نسخ الرابط!', 'Link copied!'));
}

function copyToClipboard(text, msg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(msg, 'success')).catch(() => fallbackCopy(text, msg));
  } else {
    fallbackCopy(text, msg);
  }
}

function fallbackCopy(text, msg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast(msg, 'success'); } catch(e) { showToast(t('فشل النسخ', 'Copy failed'), 'error'); }
  ta.remove();
}

function shareReferral(platform) {
  if (!userData) return;
  const link = encodeURIComponent(window.location.origin + window.location.pathname + '?ref=' + (userData.referralCode || ''));
  const text = encodeURIComponent(t('انضم إلى NileDogs واحصل على مكافآت NDOG!', 'Join NileDogs and earn NDOG rewards!'));
  const urls = {
    whatsapp: `https://wa.me/?text=${text}%20${link}`,
    telegram: `https://t.me/share/url?url=${link}&text=${text}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${link}`,
    x: `https://twitter.com/intent/tweet?text=${text}&url=${link}`
  };
  window.open(urls[platform], '_blank');
}

function applyReferralCode(code) {
  if (!currentUser || !code) return Promise.reject('No code');
  return db.ref('referralCodes/' + code).once('value').then(snap => {
    if (!snap.exists()) {
      showToast(t('كود الإحالة غير صالح', 'Invalid referral code'), 'error');
      return;
    }
    const refData = snap.val();
    if (refData.uid === currentUser.uid) return; // Can't refer yourself
    // Check if already has a referrer
    return db.ref('users/' + currentUser.uid + '/referredBy').once('value').then(rSnap => {
      if (rSnap.exists()) return; // Already has referrer
      const now = Date.now();
      const updates = {};
      updates['users/' + currentUser.uid + '/referredBy'] = refData.uid;
      updates['referrals/' + refData.uid + '/' + currentUser.uid] = {
        referredAt: now, referredEmail: currentUser.email || ''
      };
      return db.ref().update(updates).then(() => {
        createReferralChain(refData.uid, currentUser.uid, now, 1);
        showToast(t('تم تطبيق كود الإحالة! +50 NDOG', 'Referral code applied! +50 NDOG'), 'success');
      });
    });
  }).catch(err => console.error('Referral error:', err));
}

function createReferralChain(referrerUid, newUserId, now, level) {
  if (level > 3 || !REFERRAL_BONUSES[level]) return;
  const bonus = REFERRAL_BONUSES[level];
  // Add bonus to referrer
  db.ref('users/' + referrerUid).transaction(data => {
    if (!data) return data;
    data.balance = (Number(data.balance) || 0) + bonus;
    return data;
  }).then(result => {
    if (result.committed) {
      const txId = db.ref().child('transactions').push().key;
      db.ref('transactions/' + txId).set({
        uid: referrerUid, amount: bonus, ts: now,
        type: 'referral_bonus_l' + level, fromUid: newUserId
      });
    }
  });
  // Recurse to next level
  db.ref('users/' + referrerUid + '/referredBy').once('value').then(snap => {
    if (snap.exists()) {
      createReferralChain(snap.val(), newUserId, now, level + 1);
    }
  });
}

// ─── 14. Airdrop ─────────────────────────────────────────────

function claimAirdrop() {
  if (!currentUser) return;
  showLoading();
  db.ref('airdropClaims/' + currentUser.uid).once('value').then(snap => {
    if (snap.exists()) {
      hideLoading();
      showToast(t('تم المطالبة بالإير دروب مسبقاً', 'Airdrop already claimed'), 'warning');
      return;
    }
    return db.ref('config/airdrop').once('value');
  }).then(snap => {
    if (!snap || !snap.exists()) {
      hideLoading();
      showToast(t('الإير دروب غير متاح حالياً', 'Airdrop not available'), 'warning');
      return;
    }
    const airdrop = snap.val();
    const amount = airdrop.amount || 0;
    if (amount <= 0) {
      hideLoading();
      showToast(t('لا يوجد مبلغ للإير دروب', 'No airdrop amount'), 'warning');
      return;
    }
    return addBalance(amount, 'airdrop').then(() => {
      return db.ref('airdropClaims/' + currentUser.uid).set({
        claimedAt: firebase.database.ServerValue.TIMESTAMP, amount: amount
      });
    });
  }).then(() => {
    hideLoading();
    showToast(t('تم مطالبة الإير دروب بنجاح!', 'Airdrop claimed successfully!'), 'success');
  }).catch(err => {
    hideLoading();
    if (err) console.error(err);
  });
}

function loadAirdropInfo() {
  db.ref('config/airdrop').once('value').then(snap => {
    const data = snap.val() || {};
    setEl('airdrop-amount', formatNumber(data.amount || 0));
    setEl('airdropRemaining', formatNumber(data.remaining || 0));
    setEl('airdropStatus', data.active ? t('🟢 نشط', '🟢 Active') : t('🔴 متوقف', '🔴 Inactive'));
  });
}

// ─── 15. News ────────────────────────────────────────────────

function loadNews() {
  const container = document.getElementById('newsList');
  if (!container) return;
  db.ref('news').orderByChild('date').once('value').then(snap => {
    const articles = [];
    snap.forEach(child => articles.push({ ...child.val(), id: child.key }));
    articles.reverse(); // Newest first
    container.innerHTML = '';
    if (articles.length === 0) {
      container.innerHTML = `<div style="text-align:center;color:#64748b;padding:24px;">
        ${t('لا توجد أخبار حالياً', 'No news yet')}</div>`;
      return;
    }
    articles.forEach(a => {
      const title = currentLang === 'ar' ? (a.title_ar || a.title) : (a.title_en || a.title);
      const content = currentLang === 'ar' ? (a.content_ar || a.content) : (a.content_en || a.content);
      const date = a.date ? new Date(a.date).toLocaleDateString(currentLang === 'ar' ? 'ar-EG' : 'en-US') : '';
      const item = document.createElement('div');
      item.style.cssText = 'padding:16px;margin:8px 0;border-radius:12px;background:rgba(255,255,255,.06);';
      item.innerHTML = `
        <div style="font-weight:600;color:#fff;font-size:15px;">${title}</div>
        ${date ? `<div style="font-size:12px;color:#64748b;margin:4px 0;">${date}</div>` : ''}
        <div style="font-size:13px;color:#94a3b8;margin-top:8px;line-height:1.6;">${content}</div>`;
      container.appendChild(item);
    });
  });
}

// ─── 16. FAQ ─────────────────────────────────────────────────

function loadFaq() {
  const container = document.getElementById('faqList');
  if (!container) return;
  db.ref('faq').once('value').then(snap => {
    const items = [];
    snap.forEach(child => items.push({ ...child.val(), id: child.key }));
    container.innerHTML = '';
    items.forEach(item => {
      const q = currentLang === 'ar' ? (item.q_ar || item.question) : (item.q_en || item.question);
      const a = currentLang === 'ar' ? (item.a_ar || item.answer) : (item.a_en || item.answer);
      const div = document.createElement('div');
      div.style.margin = '8px 0';
      div.innerHTML = `
        <button class="faq-btn" onclick="toggleFaq(this)"
          style="width:100%;padding:14px;border:none;border-radius:10px;background:rgba(255,255,255,.06);
          color:#fff;font-weight:600;text-align:${currentLang === 'ar' ? 'right' : 'left'};cursor:pointer;
          display:flex;justify-content:space-between;align-items:center;font-size:14px;">
          <span>${q}</span>
          <span class="faq-arrow" style="transition:transform .3s;">▼</span>
        </button>
        <div class="faq-answer" style="max-height:0;overflow:hidden;transition:max-height .3s ease;padding:0 14px;">
          <div style="padding:12px 0;color:#94a3b8;font-size:13px;line-height:1.7;">${a}</div>
        </div>`;
      container.appendChild(div);
    });
  });
}

function toggleFaq(btn) {
  const answer = btn.nextElementSibling;
  const arrow = btn.querySelector('.faq-arrow');
  const isOpen = answer.style.maxHeight && answer.style.maxHeight !== '0px';
  if (isOpen) {
    answer.style.maxHeight = '0px';
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  } else {
    answer.style.maxHeight = answer.scrollHeight + 20 + 'px';
    if (arrow) arrow.style.transform = 'rotate(180deg)';
  }
}

// ─── 17. Navigation ──────────────────────────────────────────

function switchTab(tabName) {
  // Hide all sections, remove active class
  document.querySelectorAll('.tab-content').forEach(sec => {
    sec.classList.remove('active');
  });
  // Show target
  const target = document.getElementById('tab' + tabName);
  if (target) target.classList.add('active');

  // Update pills
  document.querySelectorAll('.tab-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.tab === tabName);
  });

  // Update bottom nav
  document.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Scroll to top
  const app = document.getElementById('mainApp');
  if (app) app.scrollTop = 0;

  // Load tab-specific data
  if (tabName === 'Missions') loadMissions();
  if (tabName === 'Leaderboard') loadLeaderboard();
  if (tabName === 'Staking') loadStakingContracts();
  if (tabName === 'Referral') loadReferralCount();
}

// ─── 18. Particle Background ─────────────────────────────────

function initParticles() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Create particles
  const count = Math.min(50, Math.floor(w * h / 20000));
  for (let i = 0; i < count; i++) {
    const isGold = Math.random() > 0.6;
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 2 + 1,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      color: isGold ? `rgba(245,158,11,${Math.random() * 0.3 + 0.1})` : `rgba(59,130,246,${Math.random() * 0.3 + 0.1})`
    });
  }

  function animate() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.dx;
      p.y += p.dy;
      if (p.x < 0 || p.x > w) p.dx *= -1;
      if (p.y < 0 || p.y > h) p.dy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    });
    requestAnimationFrame(animate);
  }
  animate();
}

// ─── 19. URL Referral Detection ──────────────────────────────

function detectReferral() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    localStorage.setItem('ndog_ref', ref);
    // Clean URL
    const url = new URL(window.location);
    url.searchParams.delete('ref');
    window.history.replaceState({}, '', url.toString());
  }
}

// ─── 20. Initialization ──────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Set initial language
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = currentLang;

  // Apply language to static elements
  document.querySelectorAll('[data-ar]').forEach(el => {
    el.textContent = el.getAttribute('data-' + currentLang);
  });

  // Start particles
  initParticles();

  // Build wheel if on that tab
  buildWheel();

  // Detect referral code from URL
  detectReferral();

  // Start loading state
  showLoading();
});