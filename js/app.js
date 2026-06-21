// ========== NILEDOGS (NDOG) - MAIN APPLICATION ==========
// Pure HTML + CSS + JS with Firebase Realtime Database

// ===== STATE =====
let currentUser = null;   // Firebase Auth user
let userData = null;      // User data from RTDB
let currentLang = 'ar';   // 'ar' or 'en'
let selectedPlan = '7_days';
let isSpinning = false;
let cooldownInterval = null;

// VIP tier config
const VIP_TIERS = {
  bronze:   { min: 0,      max: 999,         mult: 1,   label_ar: 'برونزي', label_en: 'Bronze',  emoji: '🥉' },
  silver:   { min: 1000,   max: 4999,        mult: 1.2, label_ar: 'فضي',   label_en: 'Silver',  emoji: '🥈' },
  gold:     { min: 5000,   max: 19999,       mult: 1.5, label_ar: 'ذهبي',   label_en: 'Gold',    emoji: '🥇' },
  platinum: { min: 20000,  max: 99999,       mult: 2,   label_ar: 'بلاتيني', label_en: 'Platinum', emoji: '💎' },
  diamond:  { min: 100000, max: 999999999,   mult: 3,   label_ar: 'ماسي',   label_en: 'Diamond',  emoji: '💠' }
};

const STREAK_MULTIPLIERS = { 2: 1.2, 3: 1.5, 5: 1.8, 7: 2, 14: 2.5, 30: 3 };
const BASE_REWARD = 10;
const WHEEL_PRIZES = [5, 10, 15, 20, 25, 50, 75, 100];
const WHEEL_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b'];

const STAKING_PLANS = {
  '7_days':   { apr: 0.05, days: 7,   min: 100  },
  '30_days':  { apr: 0.10, days: 30,  min: 500  },
  '90_days':  { apr: 0.18, days: 90,  min: 1000 },
  '180_days': { apr: 0.25, days: 180, min: 2000 }
};

const REFERRAL_BONUSES = { 1: 50, 2: 20, 3: 10 };

// ===== TRANSLATIONS =====
function t(arText, enText) {
  return currentLang === 'ar' ? arText : enText;
}

// ===== LANGUAGE =====
function toggleLang() {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

  // Update all data-ar / data-en elements
  document.querySelectorAll('[data-' + currentLang + ']').forEach(el => {
    el.textContent = el.getAttribute('data-' + currentLang);
  });

  // Update placeholders
  document.querySelectorAll('[data-placeholder-' + currentLang + ']').forEach(el => {
    el.placeholder = el.getAttribute('data-placeholder-' + currentLang);
  });

  // Update lang toggle button
  const langBtn = document.getElementById('langTextLogin');
  if (langBtn) langBtn.textContent = currentLang === 'ar' ? 'English' : 'العربية';

  // Re-render dynamic content
  if (userData) {
    renderDashboard();
    loadMissions();
    loadNews();
    loadFaq();
  }
}

// ===== TOAST =====
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type + ' show';
  setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// ===== LOADING =====
function showLoading() { document.getElementById('loadingOverlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }

// ===== AUTH =====
function loginGoogle() {
  showLoading();
  auth.signInWithPopup(googleProvider)
    .then(result => {
      // Auth state listener will handle the rest
    })
    .catch(error => {
      hideLoading();
      console.error('Login error:', error);
      if (error.code === 'auth/popup-blocked') {
        showToast(t('تم حظر النافذة المنبثقة! اسمح بالنوافذ المنبثقة.', 'Popup blocked! Allow popups.'), 'error');
      } else {
        showToast(t('فشل تسجيل الدخول', 'Login failed'), 'error');
      }
    });
}

function logout() {
  if (confirm(currentLang === 'ar' ? 'هل تريد تسجيل الخروج؟' : 'Are you sure you want to logout?')) {
    auth.signOut();
  }
}

// Auth state listener
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    initUserData(user);
  } else {
    currentUser = null;
    userData = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    hideLoading();
    if (cooldownInterval) clearInterval(cooldownInterval);
  }
});

// ===== INIT USER =====
function initUserData(user) {
  const userRef = db.ref('users/' + user.uid);

  userRef.once('value').then(snapshot => {
    const existing = snapshot.val();
    if (existing) {
      userData = existing;
      showApp();
    } else {
      // New user - create profile
      const referralCode = generateReferralCode();
      const newUser = {
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        photoURL: user.photoURL || '',
        balance: 0,
        role: 'user',
        referralCode: referralCode,
        streak: 0,
        lastClaimAt: null,
        founder: true,
        vipLevel: 'bronze',
        totalClaimed: 0,
        country: '',
        banned: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };

      userRef.set(newUser).then(() => {
        // Store referral code mapping
        db.ref('referralCodes/' + referralCode).set(user.uid);

        userData = newUser;
        showApp();
      }).catch(err => {
        console.error('Error creating user:', err);
        hideLoading();
        showToast(t('فشل إنشاء الحساب', 'Failed to create account'), 'error');
      });
    }
  }).catch(err => {
    console.error('Error fetching user:', err);
    hideLoading();
  });
}

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'flex';
  hideLoading();
  renderDashboard();
  loadMissions();
  loadLeaderboard();
  loadNews();
  loadFaq();
  loadStakingContracts();
  loadReferralCount();
  updateClaimCooldown();
}

// ===== DASHBOARD =====
function renderDashboard() {
  if (!userData) return;

  const bal = userData.balance || 0;
  const streak = userData.streak || 0;

  // Update balance display
  document.getElementById('dashBalance').textContent = formatNumber(bal);
  document.getElementById('headerBalance').textContent = formatNumber(bal) + ' NDOG';
  document.getElementById('headerName').textContent = userData.displayName || currentUser.displayName || currentUser.email;

  // Streak
  document.getElementById('dashStreak').textContent = streak;
  document.getElementById('streakCount').textContent = streak;

  // Streak progress bar (max 30 for visual)
  const streakPct = Math.min((streak / 7) * 100, 100);
  document.getElementById('streakBar').style.width = streakPct + '%';

  // Total claimed
  document.getElementById('dashTotalClaimed').textContent = formatNumber(userData.totalClaimed || 0);

  // VIP Badge
  const vip = getVipTier(bal);
  const vipEl = document.getElementById('dashVip');
  vipEl.textContent = vip.emoji + ' ' + (currentLang === 'ar' ? vip.label_ar : vip.label_en);

  // Founder badge
  document.getElementById('dashFounder').style.display = userData.founder ? 'inline-flex' : 'none';

  // Staking available
  document.getElementById('stakingAvail').textContent = formatNumber(bal) + ' NDOG';
}

function getVipTier(balance) {
  let tier = VIP_TIERS.bronze;
  for (const key in VIP_TIERS) {
    if (balance >= VIP_TIERS[key].min) tier = VIP_TIERS[key];
  }
  return tier;
}

function formatNumber(num) {
  if (typeof num !== 'number') num = 0;
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ===== DAILY CLAIM =====
function claimDaily() {
  if (!currentUser || !userData) return;

  const now = Date.now();
  const lastClaim = userData.lastClaimAt || 0;
  const hoursSince = (now - lastClaim) / (1000 * 60 * 60);

  if (hoursSince < 24) {
    showToast(t('لازمن وقت قبل المطالبة التالية!', 'Cooldown active!'), 'error');
    return;
  }

  showLoading();
  document.getElementById('claimBtn').disabled = true;

  const userRef = db.ref('users/' + currentUser.uid);
  const claimsRef = db.ref('claims').push();
  const txRef = db.ref('transactions').push();

  // Calculate streak
  let newStreak = 1;
  if (lastClaim) {
    const daysSince = Math.floor(hoursSince);
    if (daysSince <= 1) newStreak = userData.streak + 1;
    else if (daysSince > 2) newStreak = 1;
    else newStreak = userData.streak;
  }

  // Calculate multiplier
  let multiplier = 1;
  const vip = getVipTier(userData.balance || 0);
  multiplier *= vip.mult;
  for (const [days, mult] of Object.entries(STREAK_MULTIPLIERS)) {
    if (newStreak >= parseInt(days)) multiplier = mult;
  }
  if (userData.founder) multiplier *= 1.5;

  const reward = Math.round(BASE_REWARD * multiplier * 100) / 100;

  // Use transaction to safely update balance
  userRef.child('balance').transaction(function(currentBalance) {
    return (currentBalance || 0) + reward;
  }).then(result => {
    if (!result.committed) {
      hideLoading();
      document.getElementById('claimBtn').disabled = false;
      showToast(t('فشل تحديث الرصيد', 'Balance update failed'), 'error');
      return;
    }

    const updates = {};
    updates['users/' + currentUser.uid + '/streak'] = newStreak;
    updates['users/' + currentUser.uid + '/lastClaimAt'] = now;
    updates['users/' + currentUser.uid + '/totalClaimed'] = (userData.totalClaimed || 0) + reward;

    // Create claim record
    updates['claims/' + claimsRef.key] = { uid: currentUser.uid, amount: reward, ts: now };

    // Create transaction record
    updates['transactions/' + txRef.key] = { uid: currentUser.uid, type: 'daily_claim', amount: reward, ts: now, description: 'Daily claim - Day ' + newStreak + ' (x' + multiplier + ')' };

    db.ref().update(updates).then(() => {
      userData.balance = (userData.balance || 0) + reward;
      userData.streak = newStreak;
      userData.lastClaimAt = now;
      userData.totalClaimed = (userData.totalClaimed || 0) + reward;

      hideLoading();
      document.getElementById('claimBtn').disabled = false;
      renderDashboard();

      // Show success message
      const msgEl = document.getElementById('claimMessage');
      msgEl.style.display = 'block';
      msgEl.textContent = '✅ +' + reward + ' NDOG';
      setTimeout(() => { msgEl.style.display = 'none'; }, 4000);

      showToast(t('تم الحصول على ' + reward + ' NDOG!', 'Claimed ' + reward + ' NDOG!'), 'success');
    }).catch(err => {
      console.error('Claim error:', err);
      hideLoading();
      document.getElementById('claimBtn').disabled = false;
      showToast(t('فشل المطالبة', 'Claim failed'), 'error');
    });
  });
}

function updateClaimCooldown() {
  if (cooldownInterval) clearInterval(cooldownInterval);

  function check() {
    if (!userData || !userData.lastClaimAt) return;
    const now = Date.now();
    const lastClaim = userData.lastClaimAt;
    const hoursSince = (now - lastClaim) / (1000 * 60 * 60);

    if (hoursSince < 24) {
      document.getElementById('claimBtn').style.display = 'none';
      const cooldownEl = document.getElementById('claimCooldown');
      cooldownEl.style.display = 'block';
      const remaining = 24 - hoursSince;
      const h = Math.floor(remaining);
      const m = Math.floor((remaining - h) * 60);
      document.getElementById('claimTimer').textContent = h + 'h ' + m + 'm';
    } else {
      document.getElementById('claimBtn').style.display = '';
      document.getElementById('claimCooldown').style.display = 'none';
    }
  }

  check();
  cooldownInterval = setInterval(check, 60000);
}

// ===== SPIN WHEEL =====
function buildWheel() {
  const wheel = document.getElementById('spinWheel');
  wheel.innerHTML = '';
  const segAngle = 360 / WHEEL_PRIZES.length;

  WHEEL_PRIZES.forEach((prize, i) => {
    const seg = document.createElement('div');
    seg.className = 'wheel-segment';
    seg.style.background = WHEEL_COLORS[i];
    seg.style.transform = `rotate(${i * segAngle}deg)`;
    seg.style.transformOrigin = '100% 100%';
    seg.textContent = prize;
    wheel.appendChild(seg);
  });

  const center = document.createElement('div');
  center.className = 'wheel-center';
  center.id = 'wheelCenter';
  center.textContent = '🪙';
  wheel.appendChild(center);
}

function spinWheel() {
  if (!currentUser || isSpinning) return;

  // Check cooldown
  const now = Date.now();
  if (userData.lastWheelSpin && (now - userData.lastWheelSpin) < 24 * 60 * 60 * 1000) {
    showToast(t('انتظر 24 ساعة بين الدورات', 'Wait 24h between spins'), 'error');
    return;
  }

  isSpinning = true;
  document.getElementById('spinBtn').disabled = true;
  document.getElementById('spinResult').style.display = 'none';

  const prize = WHEEL_PRIZES[Math.floor(Math.random() * WHEEL_PRIZES.length)];
  const prizeIndex = WHEEL_PRIZES.indexOf(prize);
  const targetAngle = 360 - (prizeIndex * (360 / WHEEL_PRIZES.length)) - (360 / WHEEL_PRIZES.length / 2);
  const totalRotation = 1440 + targetAngle;

  const wheel = document.getElementById('spinWheel');
  wheel.style.transform = 'rotate(' + totalRotation + 'deg)';

  setTimeout(() => {
    // Update balance
    const userRef = db.ref('users/' + currentUser.uid);
    userRef.child('balance').transaction(function(bal) { return (bal || 0) + prize; }).then(result => {
      if (result.committed) {
        const updates = {};
        updates['users/' + currentUser.uid + '/totalClaimed'] = (userData.totalClaimed || 0) + prize;
        updates['users/' + currentUser.uid + '/lastWheelSpin'] = now;
        updates['wheelSpins/' + currentUser.uid + '/' + Date.now()] = { prize: prize, ts: now };
        updates['transactions/' + Date.now()] = { uid: currentUser.uid, type: 'spin_wheel', amount: prize, ts: now };
        db.ref().update(updates);

        userData.balance = (userData.balance || 0) + prize;
        userData.totalClaimed = (userData.totalClaimed || 0) + prize;
        userData.lastWheelSpin = now;
        renderDashboard();
      }
    });

    document.getElementById('wheelCenter').textContent = prize;
    document.getElementById('spinResult').style.display = 'block';
    document.getElementById('spinResult').textContent = t('🎉 فزت بـ ' + prize + ' NDOG!', '🎉 You won ' + prize + ' NDOG!');
    showToast(t('+' + prize + ' NDOG!', 'You won ' + prize + ' NDOG!'), 'success');

    isSpinning = false;
    document.getElementById('spinBtn').disabled = false;
  }, 4500);
}

// ===== MINI GAMES =====
function playLuckyBox() {
  if (!currentUser) return;
  const prize = Math.floor(Math.random() * 96) + 5;
  addBalance(prize, 'lucky_box');
  document.getElementById('luckyBoxBtn').textContent = '+' + prize;
  document.getElementById('luckyBoxBtn').style.color = '#10b981';
  setTimeout(() => {
    document.getElementById('luckyBoxBtn').textContent = t('العب', 'Play');
    document.getElementById('luckyBoxBtn').style.color = '';
  }, 2000);
}

function playScratchCard() {
  if (!currentUser) return;
  const prize = Math.floor(Math.random() * 196) + 5;
  addBalance(prize, 'scratch_card');
  document.getElementById('scratchBtn').textContent = '+' + prize;
  document.getElementById('scratchBtn').style.color = '#10b981';
  setTimeout(() => {
    document.getElementById('scratchBtn').textContent = t('العب', 'Play');
    document.getElementById('scratchBtn').style.color = '';
  }, 2000);
}

function addBalance(amount, type) {
  if (!currentUser) return;
  const now = Date.now();
  const userRef = db.ref('users/' + currentUser.uid);
  userRef.child('balance').transaction(function(bal) { return (bal || 0) + amount; }).then(result => {
    if (result.committed) {
      const updates = {};
      updates['users/' + currentUser.uid + '/totalClaimed'] = (userData.totalClaimed || 0) + amount;
      updates['transactions/' + Date.now()] = { uid: currentUser.uid, type: type, amount: amount, ts: now };
      db.ref().update(updates);
      userData.balance = (userData.balance || 0) + amount;
      userData.totalClaimed = (userData.totalClaimed || 0) + amount;
      renderDashboard();
      showToast(t('+' + amount + ' NDOG!', 'You won ' + amount + ' NDOG!'), 'success');
    }
  });
}

// ===== MISSIONS =====
function loadMissions() {
  db.ref('missions').once('value').then(snapshot => {
    const missions = snapshot.val() || {};
    renderMissions('dailyMissionsList', missions.daily || {});
    renderMissions('weeklyMissionsList', missions.weekly || {});
    renderMissions('monthlyMissionsList', missions.monthly || {});
  });
}

function renderMissions(containerId, missions) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  Object.values(missions).forEach(mission => {
    const title = currentLang === 'ar' ? mission.title_ar : mission.title_en;
    const item = document.createElement('div');
    item.className = 'mission-item';
    item.innerHTML = `
      <div class="mission-info">
        <h4>${title}</h4>
        <p>+${mission.reward} NDOG</p>
      </div>
      <button class="btn-mission" onclick="completeMission('${mission.id}', ${mission.reward})">
        ${mission.autoComplete ? t('اطلب', 'Claim') : t('مكتمل', 'Done')}
      </button>
    `;
    container.appendChild(item);
  });
}

function completeMission(missionId, reward) {
  if (!currentUser) return;
  const progressRef = db.ref('missionProgress/' + currentUser.uid + '/' + missionId);

  progressRef.once('value').then(snapshot => {
    if (snapshot.exists() && snapshot.val().completed) {
      showToast(t('مكتمل بالفعل!', 'Already completed!'), 'info');
      return;
    }

    const now = Date.now();
    progressRef.set({ completed: true, completedAt: now });

    const userRef = db.ref('users/' + currentUser.uid);
    userRef.child('balance').transaction(function(bal) { return (bal || 0) + reward; }).then(result => {
      if (result.committed) {
        const updates = {};
        updates['users/' + currentUser.uid + '/totalClaimed'] = (userData.totalClaimed || 0) + reward;
        updates['transactions/' + Date.now()] = { uid: currentUser.uid, type: 'mission_reward', amount: reward, ts: now, description: 'Mission: ' + missionId };
        db.ref().update(updates);
        userData.balance = (userData.balance || 0) + reward;
        userData.totalClaimed = (userData.totalClaimed || 0) + reward;
        renderDashboard();
        showToast(t('+' + reward + ' NDOG!', 'Mission completed! +' + reward + ' NDOG'), 'success');
      }
    });
  });
}

// ===== STAKING =====
function selectPlan(btn, planId) {
  selectedPlan = planId;
  document.querySelectorAll('.staking-plan').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function stakeTokens() {
  if (!currentUser || !userData) return;
  const amount = parseFloat(document.getElementById('stakeAmount').value);
  const plan = STAKING_PLANS[selectedPlan];

  if (!amount || amount <= 0) {
    showToast(t('أدخل كمية صحيحة', 'Enter valid amount'), 'error');
    return;
  }
  if (amount < plan.min) {
    showToast(t('الحد الأدنى: ' + plan.min, 'Minimum: ' + plan.min), 'error');
    return;
  }
  if (amount > userData.balance) {
    showToast(t('رصيد غير كافٍ', 'Insufficient balance'), 'error');
    return;
  }

  showLoading();
  const now = Date.now();
  const endDate = now + (plan.days * 24 * 60 * 60 * 1000);
  const contractRef = db.ref('stakingContracts').push();

  contractRef.set({
    uid: currentUser.uid,
    amount: amount,
    planId: selectedPlan,
    startDate: now,
    endDate: endDate,
    apr: plan.apr,
    earnedRewards: 0,
    status: 'active'
  }).then(() => {
    // Deduct balance using transaction
    const userRef = db.ref('users/' + currentUser.uid);
    userRef.child('balance').transaction(function(bal) {
      return Math.max(0, (bal || 0) - amount);
    }).then(result => {
      if (result.committed) {
        userData.balance = Math.max(0, (userData.balance || 0) - amount);
        renderDashboard();
        document.getElementById('stakeAmount').value = '';
        showToast(t('تم التخزين بنجاح!', 'Staked successfully!'), 'success');
        loadStakingContracts();
      }
      hideLoading();
    });
  }).catch(err => {
    console.error('Stake error:', err);
    hideLoading();
    showToast(t('فشل التخزين', 'Staking failed'), 'error');
  });
}

function loadStakingContracts() {
  if (!currentUser) return;
  db.ref('stakingContracts').orderByChild('uid').equalTo(currentUser.uid).once('value').then(snapshot => {
    const container = document.getElementById('contractsList');
    if (!container) return;
    container.innerHTML = '';

    const contracts = snapshot.val();
    if (!contracts) {
      container.innerHTML = '<p class="empty-state">' + t('لا توجد عقود نشطة', 'No active contracts') + '</p>';
      return;
    }

    Object.values(contracts).forEach(contract => {
      if (contract.status !== 'active') return;
      const plan = STAKING_PLANS[contract.planId] || {};
      const earned = Math.round(contract.amount * contract.apr * 100) / 100;
      const totalReturn = contract.amount + earned;
      const now = Date.now();
      const isMatured = now >= contract.endDate;
      const daysLeft = Math.max(0, Math.ceil((contract.endDate - now) / (1000 * 60 * 60 * 24)));

      const item = document.createElement('div');
      item.className = 'contract-item';
      item.innerHTML = `
        <div class="contract-info">
          <h4>${plan.days || '?'} ${t('يوم', 'days')} - ${(contract.apr * 100)}% APR</h4>
          <p>${contract.amount} NDOG | ${t('المربح', 'Earned')}: +${earned} NDOG</p>
        </div>
        <button class="btn-unstake" ${!isMatured ? 'disabled' : ''} onclick="unstake('${contract.endDate}', ${contract.amount}, ${earned})">
          ${isMatured ? t('استرداد', 'Claim') : daysLeft + 'd'}
        </button>
      `;
      container.appendChild(item);
    });
  });
}

function unstake(endDate, amount, earnedRewards) {
  if (!currentUser) return;
  const now = Date.now();
  if (now < endDate) {
    showToast(t('لم ينتهي العقد بعد', 'Contract not matured yet'), 'error');
    return;
  }

  showLoading();
  const totalReturn = amount + earnedRewards;
  const userRef = db.ref('users/' + currentUser.uid);
  userRef.child('balance').transaction(function(bal) { return (bal || 0) + totalReturn; }).then(result => {
    if (result.committed) {
      userData.balance = (userData.balance || 0) + totalReturn;
      renderDashboard();
      showToast(t('تم الاسترداد: ' + totalReturn + ' NDOG', 'Unstaked: ' + totalReturn + ' NDOG'), 'success');
      loadStakingContracts();
    }
    hideLoading();
  });
}

// ===== LEADERBOARD =====
function loadLeaderboard() {
  // Top Balance
  db.ref('users').orderByChild('balance').limitToLast(20).once('value').then(snapshot => {
    const users = snapshot.val() || {};
    const list = Object.values(users).sort((a, b) => (b.balance || 0) - (a.balance || 0));
    renderLeaderboard('topBalanceList', list, 'balance');
  });

  // Top Streak
  db.ref('users').orderByChild('streak').limitToLast(10).once('value').then(snapshot => {
    const users = snapshot.val() || {};
    const list = Object.values(users).sort((a, b) => (b.streak || 0) - (a.streak || 0));
    renderLeaderboard('topStreakList', list, 'streak');
  });
}

function renderLeaderboard(containerId, users, field) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  users.slice(0, 10).forEach((user, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const value = field === 'streak' ? (user.streak || 0) + (currentLang === 'ar' ? ' يوم' : ' days') : formatNumber(user.balance || 0);

    const item = document.createElement('div');
    item.className = 'lb-item' + (rank <= 3 ? ' top' : '');
    item.innerHTML = `
      <div class="lb-left">
        <span class="lb-rank ${rankClass}">${rank}</span>
        <span class="lb-name">${user.displayName || 'User'}</span>
      </div>
      <span class="lb-value">${value}</span>
    `;
    container.appendChild(item);
  });
}

// ===== REFERRAL =====
function loadReferralCount() {
  if (!currentUser) return;
  db.ref('referrals/' + currentUser.uid).once('value').then(snapshot => {
    const refs = snapshot.val() || {};
    document.getElementById('referralCount').textContent = Object.keys(refs).length;
  });
}

function copyReferralCode() {
  const code = userData ? userData.referralCode : '';
  if (code) {
    navigator.clipboard.writeText(code).then(() => {
      showToast(t('تم نسخ الكود!', 'Code copied!'), 'success');
    }).catch(() => {
      // Fallback
      const input = document.createElement('input');
      input.value = code;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showToast(t('تم نسخ الكود!', 'Code copied!'), 'success');
    });
  }
}

function applyReferralCode() {
  if (!currentUser || !userData) return;
  const code = document.getElementById('referralCodeInput').value.trim().toUpperCase();

  if (!code) {
    showToast(t('أدخل كود إحالة', 'Enter referral code'), 'error');
    return;
  }

  if (userData.referredBy) {
    showToast(t('أنت مسجل بالإحالة بالفعل', 'Already referred'), 'info');
    return;
  }

  // Look up referral code
  db.ref('referralCodes/' + code).once('value').then(snapshot => {
    const referrerUid = snapshot.val();
    if (!referrerUid || referrerUid === currentUser.uid) {
      showToast(t('كود غير صالح', 'Invalid code'), 'error');
      return;
    }

    showLoading();
    const now = Date.now();

    // Update referred user
    db.ref('users/' + currentUser.uid + '/referredBy').set(referrerUid);

    // Create referral records (L1, L2, L3)
    createReferralChain(referrerUid, currentUser.uid, now, 1);
  });
}

function createReferralChain(referrerUid, newUserId, now, level) {
  const bonus = REFERRAL_BONUSES[level] || 0;

  if (bonus > 0) {
    const refRef = db.ref('referrals/' + referrerUid + '/' + newUserId);
    refRef.set({ uid: newUserId, level: level, bonus: bonus, ts: now });

    const referrerUserRef = db.ref('users/' + referrerUid);
    referrerUserRef.child('balance').transaction(function(bal) { return (bal || 0) + bonus; });

    showToast(t('تم تطبيق كود الإحالة! +مكافأة للمحيل', 'Referral applied!'), 'success');
  }

  // Check for L2/L3
  if (level < 3) {
    db.ref('users/' + referrerUid + '/referredBy').once('value').then(snapshot => {
      const parentUid = snapshot.val();
      if (parentUid) {
        createReferralChain(parentUid, newUserId, now, level + 1);
      }
      hideLoading();
    });
  } else {
    hideLoading();
  }

  // Clear input
  document.getElementById('referralCodeInput').value = '';
}

// ===== NEWS =====
function loadNews() {
  db.ref('news').once('value').then(snapshot => {
    const news = snapshot.val() || {};
    const container = document.getElementById('newsList');
    if (!container) return;
    container.innerHTML = '';

    const sorted = Object.values(news).sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));

    sorted.forEach(item => {
      const title = currentLang === 'ar' ? item.title_ar : item.title_en;
      const content = currentLang === 'ar' ? item.content_ar : item.content_en;
      const date = new Date(item.publishedAt || Date.now()).toLocaleDateString(currentLang === 'ar' ? 'ar-EG' : 'en-US');

      const el = document.createElement('div');
      el.className = 'news-item' + (item.featured ? ' featured' : '');
      el.innerHTML = `
        <div class="news-badges">
          <span class="news-badge">${item.category || 'news'}</span>
          ${item.featured ? '<span class="news-badge star">⭐ ' + t('مميز', 'Featured') + '</span>' : ''}
        </div>
        <h3>${title}</h3>
        <p>${content}</p>
        <p class="news-date">${item.author || 'NileDogs'} • ${date}</p>
      `;
      container.appendChild(el);
    });
  });
}

// ===== FAQ =====
function loadFaq() {
  db.ref('faq').once('value').then(snapshot => {
    const faqs = snapshot.val() || {};
    const container = document.getElementById('faqList');
    if (!container) return;
    container.innerHTML = '';

    const sorted = Object.values(faqs).filter(f => f.active).sort((a, b) => (a.order || 0) - (b.order || 0));

    sorted.forEach((faq, i) => {
      const question = currentLang === 'ar' ? faq.question_ar : faq.question_en;
      const answer = currentLang === 'ar' ? faq.answer_ar : faq.answer_en;

      const el = document.createElement('div');
      el.className = 'faq-item';
      el.innerHTML = `
        <button class="faq-question" onclick="toggleFaq(this)">
          <span>${question}</span>
          <span class="faq-arrow">◀</span>
        </button>
        <div class="faq-answer">${answer}</div>
      `;
      container.appendChild(el);
    });
  });
}

function toggleFaq(btn) {
  const item = btn.parentElement;
  const isOpen = item.classList.contains('open');

  // Close all
  document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('open'));

  if (!isOpen) item.classList.add('open');
}

// ===== NAVIGATION =====
function switchTab(tabName) {
  // Update tab sections
  document.querySelectorAll('.tab-section').forEach(section => {
    section.classList.remove('active');
  });
  const targetSection = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  if (targetSection) targetSection.classList.add('active');

  // Update tab pills
  document.querySelectorAll('.tab-pill').forEach(pill => {
    pill.classList.toggle('active', pill.getAttribute('data-tab') === tabName);
  });

  // Update bottom nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== INIT ON LOAD =====
document.addEventListener('DOMContentLoaded', function() {
  buildWheel();

  // Listen for auth state changes
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      initUserData(user);
    } else {
      currentUser = null;
      userData = null;
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('mainApp').style.display = 'none';
      hideLoading();
    }
  });
});
