/* ═══════════════════════════════════════════════════════════
   NDOG COIN — Application Logic v4.0
   ✅ Telegram Mini App Auth (Custom Token → Firebase Auth)
   ✅ حساب موحّد بين الويب وتيليجرام — نفس الـ uid
   ✅ ربط تيليجرام بحساب Google/Email موجود
   ✅ تراجع آمن لتسجيل الدخول بـ Google عند الحاجة
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════════════════════════
// 1. STATE
// ══════════════════════════════════════════════════════════
let currentUser    = null;
let userData       = null;
let currentLang    = localStorage.getItem('ndog_lang') || 'ar';
let selectedPlan   = '7_days';
let isSpinning     = false;
let wheelRotation  = 0;
let cooldownInterval = null;
let miningInterval   = null;
let boostInterval    = null;
let isMining       = false;
let miningStartTime  = 0;
let miningEarned   = 0;
let boostActive    = false;
let boostEndTime   = 0;
let boostTimer     = null;

// ── متغيرات Telegram Mini App ──
let tgApp          = null;   // window.Telegram.WebApp
let isTelegramEnv  = false;  // هل نحن داخل تيليجرام؟
let tgAuthDone     = false;  // هل تمّ التحقق مرة واحدة؟

// رابط الـ Cloudflare Worker (عدّله ليطابق عنوانك)
const WORKER_URL = 'https://ndogtg.ads4ads2029.workers.dev';

// ══════════════════════════════════════════════════════════
// 2. CONSTANTS
// ══════════════════════════════════════════════════════════
const VIP = {
  bronze:   { min: 0,      mult: 1.0, labelAr: 'برونزي',  labelEn: 'Bronze',   emoji: '🥉' },
  silver:   { min: 1000,   mult: 1.2, labelAr: 'فضي',     labelEn: 'Silver',   emoji: '🥈' },
  gold:     { min: 5000,   mult: 1.5, labelAr: 'ذهبي',    labelEn: 'Gold',     emoji: '🥇' },
  platinum: { min: 20000,  mult: 2.0, labelAr: 'بلاتيني', labelEn: 'Platinum', emoji: '💎' },
  diamond:  { min: 100000, mult: 3.0, labelAr: 'ألماسي',  labelEn: 'Diamond',  emoji: '💠' },
};
const STREAK_MULTS       = { 2:1.2, 3:1.5, 5:1.8, 7:2, 14:2.5, 30:3 };
const BASE_REWARD        = 10;
const WHEEL_PRIZES       = [5, 10, 15, 20, 25, 50, 75, 100];
const WHEEL_COLORS       = ['#EF4444','#F97316','#EAB308','#22C55E','#06B6D4','#8B5CF6','#EC4899','#F59E0B'];
const STAKING = {
  '7_days':   { apr: 0.05, days: 7,   min: 100  },
  '30_days':  { apr: 0.10, days: 30,  min: 500  },
  '90_days':  { apr: 0.18, days: 90,  min: 1000 },
  '180_days': { apr: 0.25, days: 180, min: 2000 },
};
const REF_BONUSES        = { 1: 50, 2: 20, 3: 10 };
const MINING_RATE        = 10;       // NDOG / hour
const MINING_SESSION_SECS = 60;      // مدة جلسة التعدين (ثانية)
const BOOST_DURATION_SECS = 30 * 60; // 30 دقيقة تعزيز

// ══════════════════════════════════════════════════════════
// 3. LANGUAGE
// ══════════════════════════════════════════════════════════
function t(ar, en) { return currentLang === 'ar' ? ar : en; }

function applyLang() {
  document.documentElement.dir  = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-ar]').forEach(el => {
    const val = el.getAttribute('data-' + currentLang);
    if (val !== null) {
      if (el.tagName === 'INPUT') el.placeholder = val;
      else el.textContent = val;
    }
  });
}

function toggleLang() {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('ndog_lang', currentLang);
  applyLang();
  if (userData) { renderDashboard(); loadNews(); loadFaq(); loadMissions(); }
}

// ══════════════════════════════════════════════════════════
// 4. UI HELPERS
// ══════════════════════════════════════════════════════════
function showToast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${msg}</span>`;
  stack.appendChild(toast);
  setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, 3200);
}

function showLoading() { const el = document.getElementById('globalLoading'); if (el) el.style.display = 'flex'; }
function hideLoading() { const el = document.getElementById('globalLoading'); if (el) el.style.display = 'none'; }
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function q(id)  { return document.getElementById(id); }
function pad(n) { return String(n).padStart(2, '0'); }

function fmt(num, fractions = 0) {
  const n = Number(num) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  if (fractions)      return n.toFixed(fractions);
  return n.toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US');
}

function getVip(balance) {
  const b = Number(balance) || 0;
  let tier = VIP.bronze;
  for (const k in VIP) if (b >= VIP[k].min) tier = VIP[k];
  return tier;
}

function getStreakMult(streak) {
  let m = 1;
  for (const d in STREAK_MULTS) if (streak >= +d) m = STREAK_MULTS[d];
  return m;
}

function copyText(text, successMsg) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast(successMsg, 'success'))
      .catch(() => fallbackCopy(text, successMsg));
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, msg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast(msg, 'success'); }
  catch { showToast(t('فشل النسخ', 'Copy failed'), 'error'); }
  ta.remove();
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ══════════════════════════════════════════════════════════
// 5. TELEGRAM MINI APP AUTH
//
//  المنطق الكامل:
//  ┌─────────────────────────────────────────────────────┐
//  │ داخل تيليجرام (isTelegramEnv = true)               │
//  │   → أرسل initData للـ Worker                       │
//  │   → Worker يتحقق ويُعيد customToken + uid          │
//  │   → signInWithCustomToken(customToken)              │
//  │   → currentUser.uid = نفس الـ uid الموحّد           │
//  │                                                     │
//  │ خارج تيليجرام (ويب عادي)                            │
//  │   → تسجيل دخول بـ Google كالمعتاد                   │
//  │   → إذا سبق وفتح المستخدم البوت من تيليجرام        │
//  │     سيجد نفس الحساب (uid موحّد)                     │
//  └─────────────────────────────────────────────────────┘
// ══════════════════════════════════════════════════════════

async function initTelegramAuth() {
  tgApp = window.Telegram?.WebApp;

  if (!tgApp || !tgApp.initData) {
    // لسنا داخل تيليجرام — استخدم تدفق الويب العادي
    isTelegramEnv = false;
    return false;
  }

  isTelegramEnv = true;

  // ── إخبار تيليجرام أن التطبيق جاهز وتوسيعه ──
  tgApp.ready();
  tgApp.expand();

  // ── تطبيق ألوان تيليجرام إن وُجدت ──
  applyTelegramTheme();

  // ── إخفاء زر تسجيل الدخول بـ Google (غير ضروري داخل تيليجرام) ──
  const googleBtn = q('googleSignInBtn');
  if (googleBtn) googleBtn.style.display = 'none';

  // إظهار شاشة تحميل تيليجرام
  showTelegramLoginScreen();
  showLoading();

  try {
    // ── إرسال initData للـ Worker للتحقق وإنشاء/جلب الحساب ──
    const res = await fetch(`${WORKER_URL}/api/auth?initData=${encodeURIComponent(tgApp.initData)}`);

    if (!res.ok) {
      throw new Error(`Worker returned ${res.status}`);
    }

    const data = await res.json();

    if (!data.ok || !data.customToken) {
      throw new Error(data.error || 'auth_failed');
    }

    // ── تسجيل الدخول في Firebase باستخدام Custom Token ──
    await auth.signInWithCustomToken(data.customToken);

    // onAuthStateChanged سيتولى الباقي
    tgAuthDone = true;
    return true;

  } catch (err) {
    console.error('[NDOG] Telegram auth error:', err);
    hideLoading();

    // ── Fallback: اعرض خيار تسجيل الدخول بـ Google ──
    showToast(t('فشل التحقق من تيليجرام. جرّب الدخول بـ Google.', 'Telegram auth failed. Try Google login.'), 'error');
    isTelegramEnv = false;
    showWebLoginScreen();
    return false;
  }
}

/*  ربط حساب Google/Email الحالي بتيليجرام
    يُستدعى تلقائيًا بعد تسجيل الدخول بـ Google داخل تيليجرام
    أو يمكن استدعاؤه يدويًا من إعدادات الملف الشخصي               */
async function linkTelegramToCurrentAccount() {
  if (!tgApp?.initData || !currentUser) return;
  if (currentUser.isAnonymous) return; // حساب تيليجرام مُنشأ بالفعل

  try {
    const res = await fetch(`${WORKER_URL}/api/link-telegram`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        firebaseUid: currentUser.uid,
        initData:    tgApp.initData,
      }),
    });
    const data = await res.json();

    if (data.ok) {
      showToast(t('✅ تم ربط حساب تيليجرام!', '✅ Telegram linked!'), 'success');
      // تحديث بيانات المستخدم في Firebase
      await db.ref(`users/${currentUser.uid}`).update({
        telegramId: String(tgApp.initDataUnsafe?.user?.id || ''),
        telegramUsername: tgApp.initDataUnsafe?.user?.username || '',
      });
    } else if (data.error === 'telegram_already_linked_to_another_account') {
      showToast(t('⚠️ هذا الحساب مرتبط بحساب آخر', '⚠️ This Telegram is linked to another account'), 'warning');
    }
  } catch (err) {
    console.error('[NDOG] Link telegram error:', err);
  }
}

function applyTelegramTheme() {
  if (!tgApp?.themeParams) return;
  const p = tgApp.themeParams;
  // يمكن تجاوز متغيرات CSS بألوان تيليجرام إن أردت
  // document.documentElement.style.setProperty('--bg', p.bg_color || '');
}

function showTelegramLoginScreen() {
  // أظهر شاشة تحميل مخصصة بدلاً من شاشة تسجيل الدخول العادية
  const loginScreen = q('loginScreen');
  if (loginScreen) {
    loginScreen.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:40px 20px">
        <div style="font-size:64px">🐕</div>
        <div style="font-size:22px;font-weight:700;color:var(--text-1)">NDOG Coin</div>
        <div style="font-size:14px;color:var(--text-3)">${t('جاري التحقق من حساب تيليجرام...', 'Verifying Telegram account...')}</div>
        <div class="spinner" style="margin-top:10px"></div>
      </div>`;
    loginScreen.style.display = 'flex';
  }
}

function showWebLoginScreen() {
  const loginScreen = q('loginScreen');
  if (loginScreen) {
    loginScreen.style.display = 'flex';
    // إظهار زر Google مرة أخرى
    const googleBtn = q('googleSignInBtn');
    if (googleBtn) googleBtn.style.display = 'flex';
  }
}

// ══════════════════════════════════════════════════════════
// 6. AUTH — Google Login (ويب عادي)
// ══════════════════════════════════════════════════════════
function loginGoogle() {
  showLoading();
  auth.signInWithPopup(googleProvider).catch(err => {
    hideLoading();
    const msgs = {
      'auth/popup-blocked':      t('يُرجى السماح بالنوافذ المنبثقة', 'Please allow popups'),
      'auth/unauthorized-domain': t('نطاق غير مصرح به', 'Unauthorized domain'),
    };
    showToast(msgs[err.code] || t('فشل الدخول: ' + err.message, 'Login failed: ' + err.message), 'error');
  });
}

function logout() {
  if (!confirm(t('هل تريد تسجيل الخروج؟', 'Sign out?'))) return;
  // لا نسمح بالخروج داخل تيليجرام (سيفتح من جديد بنفس الحساب)
  if (isTelegramEnv && tgApp) {
    showToast(t('لا يمكن تسجيل الخروج داخل تيليجرام', 'Cannot sign out inside Telegram'), 'info');
    return;
  }
  if (cooldownInterval) clearInterval(cooldownInterval);
  if (miningInterval)   clearInterval(miningInterval);
  if (boostInterval)    clearInterval(boostInterval);
  auth.signOut();
}

// ══════════════════════════════════════════════════════════
// 7. FIREBASE AUTH STATE LISTENER
// ══════════════════════════════════════════════════════════
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;

    // إذا كنا داخل تيليجرام وسجّل المستخدم بـ Google
    // → نحاول ربط حساب تيليجرام بحساب Google تلقائيًا
    if (isTelegramEnv && !user.isAnonymous && tgApp?.initData && tgAuthDone === false) {
      linkTelegramToCurrentAccount();
    }

    initUserData(user);
  } else {
    currentUser = null;
    userData    = null;
    const mainApp     = q('mainApp');
    const loginScreen = q('loginScreen');
    if (mainApp)     mainApp.style.display     = 'none';
    if (loginScreen) loginScreen.style.display = 'flex';
    hideLoading();

    // داخل تيليجرام ولم يُسجَّل بعد → ابدأ مصادقة تيليجرام
    if (isTelegramEnv && !tgAuthDone) {
      initTelegramAuth();
    }
  }
});

// ══════════════════════════════════════════════════════════
// 8. USER INIT
// ══════════════════════════════════════════════════════════
function initUserData(user) {
  db.ref('users/' + user.uid).once('value').then(snap => {
    if (snap.exists()) {
      userData = { ...snap.val(), uid: user.uid };

      // ── تحديث اسم المستخدم من تيليجرام إذا تغيّر ──
      if (isTelegramEnv && tgApp?.initDataUnsafe?.user) {
        const tgU = tgApp.initDataUnsafe.user;
        const tgName = [tgU.first_name, tgU.last_name].filter(Boolean).join(' ');
        if (tgName && tgName !== userData.displayName) {
          db.ref(`users/${user.uid}/displayName`).set(tgName);
          userData.displayName = tgName;
        }
      }

      showApp();
    } else {
      // ── إنشاء ملف المستخدم الجديد ──
      const code = genCode();
      const ts   = firebase.database.ServerValue.TIMESTAMP;

      // الاسم: من تيليجرام أو Google
      let displayName = user.displayName || '';
      if (isTelegramEnv && tgApp?.initDataUnsafe?.user) {
        const tgU = tgApp.initDataUnsafe.user;
        displayName = [tgU.first_name, tgU.last_name].filter(Boolean).join(' ') || displayName;
      }

      // telegramId: من تيليجرام إن وُجد
      const tgId = isTelegramEnv ? String(tgApp?.initDataUnsafe?.user?.id || '') : '';
      const tgUsername = isTelegramEnv ? (tgApp?.initDataUnsafe?.user?.username || '') : '';

      const profile = {
        displayName,
        email:              user.email || '',
        photoURL:           user.photoURL || '',
        telegramId:         tgId,
        telegramUsername:   tgUsername,
        balance:            0,
        streak:             0,
        lastClaimAt:        0,
        totalClaimed:       0,
        referralCode:       code,
        referredBy:         null,
        founder:            true,
        vipLevel:           'bronze',
        createdAt:          ts,
        miningSessionsTotal: 0,
        earnedToday:        0,
        platform:           isTelegramEnv ? 'telegram' : 'web',
      };

      const updates = {};
      updates[`users/${user.uid}`]         = profile;
      updates[`referralCodes/${code}`]     = { uid: user.uid, createdAt: ts };

      // تسجيل الفهرس telegramId → uid إذا كنا في تيليجرام
      if (tgId) {
        updates[`telegramIndex/${tgId}`] = user.uid;
      }

      db.ref().update(updates).then(() => {
        userData = { ...profile, uid: user.uid };

        // ── تطبيق كود الإحالة المحفوظ ──
        const savedRef = localStorage.getItem('ndog_ref');
        if (savedRef) {
          applyReferralCode(savedRef).finally(() => {
            localStorage.removeItem('ndog_ref');
            showApp();
          });
        } else {
          showApp();
        }
      }).catch(() => {
        hideLoading();
        showToast(t('فشل إنشاء الحساب', 'Failed to create account'), 'error');
      });
    }
  }).catch(() => {
    hideLoading();
    showToast(t('خطأ في التحميل', 'Load error'), 'error');
  });
}

// ══════════════════════════════════════════════════════════
// 9. SHOW APP
// ══════════════════════════════════════════════════════════
function showApp() {
  hideLoading();
  const loginScreen = q('loginScreen');
  const mainApp     = q('mainApp');
  if (loginScreen) loginScreen.style.display = 'none';
  if (mainApp)     mainApp.style.display     = 'block';

  switchTab('home');
  renderDashboard();
  startCooldownTimer();
  loadNews();
  loadFaq();
  loadAirdropInfo();
  loadStakingContracts();
  loadReferralCount();
  buildWheel();
  initBgCanvas();
  updateMiningUI();

  // ── إخفاء زر تسجيل الخروج داخل تيليجرام ──
  if (isTelegramEnv) {
    [q('logoutBtn'), q('logoutBtnFull')].forEach(btn => {
      if (btn) btn.style.display = 'none';
    });
    // زر ربط تيليجرام: إخفاؤه لأنه مرتبط بالفعل
    const linkTgBtn = q('linkTelegramBtn');
    if (linkTgBtn) linkTgBtn.style.display = 'none';
  } else {
    // عرض زر "ربط تيليجرام" في الملف الشخصي إذا لم يكن مرتبطًا
    const linkTgBtn = q('linkTelegramBtn');
    if (linkTgBtn && !userData?.telegramId) {
      linkTgBtn.style.display = 'flex';
    }
  }

  // ── تحديث فوري عبر Real-time Listener ──
  db.ref('users/' + currentUser.uid).on('value', snap => {
    if (snap.exists()) {
      userData = { ...snap.val(), uid: currentUser.uid };
      renderDashboard();
    }
  });
}

// ══════════════════════════════════════════════════════════
// 10. DASHBOARD
// ══════════════════════════════════════════════════════════
function renderDashboard() {
  if (!userData) return;

  const bal        = userData.balance     || 0;
  const streak     = userData.streak      || 0;
  const vip        = getVip(bal);
  const streakMult = getStreakMult(streak);
  const totalMult  = vip.mult * streakMult * (userData.founder ? 1.1 : 1);

  // ── الأرصدة ──
  setEl('dashBalance', fmt(bal));
  setEl('walletBalance', fmt(bal));

  // ── الإحصاءات السريعة ──
  setEl('dashStreak', streak);
  setEl('dashTotal',  fmt(userData.totalClaimed || 0));
  setEl('dashMult',  '×' + totalMult.toFixed(2));

  // ── الملف الشخصي ──
  const name = userData.displayName || currentUser?.displayName || '—';
  setEl('headerName',   name);
  setEl('profileName',  name);
  setEl('profileEmail', userData.email || (isTelegramEnv ? t('حساب تيليجرام', 'Telegram Account') : '—'));

  // ── شارة تيليجرام ──
  const tgBadge = q('telegramBadge');
  if (tgBadge) {
    tgBadge.style.display = userData.telegramId ? 'inline-flex' : 'none';
    tgBadge.textContent = userData.telegramUsername
      ? `✈️ @${userData.telegramUsername}`
      : '✈️ تيليجرام';
  }

  // ── الصور الرمزية ──
  const photoURL = userData.photoURL || currentUser?.photoURL || '';
  ['avatarImg', 'profileAvatarImg'].forEach(id => {
    const img = q(id);
    const fb  = q(id === 'avatarImg' ? 'avatarFallback' : 'profileAvatarFallback');
    if (img && photoURL) {
      img.src = photoURL; img.style.display = 'block';
      if (fb) fb.style.display = 'none';
    } else if (img) {
      img.style.display = 'none';
      // لمستخدمي تيليجرام: اعرض أول حرف من الاسم
      if (fb) { fb.style.display = 'flex'; fb.textContent = (name || '?').charAt(0).toUpperCase(); }
    }
  });

  // ── شارة VIP ──
  const vipEl = q('dashVip');
  if (vipEl) {
    vipEl.style.display = 'inline-flex';
    vipEl.textContent   = vip.emoji + ' ' + (currentLang === 'ar' ? vip.labelAr : vip.labelEn);
  }

  // ── شارة المؤسس ──
  const founderEl = q('dashFounder');
  if (founderEl) founderEl.style.display = userData.founder ? 'inline-flex' : 'none';

  // ── شارات الملف الشخصي ──
  const profBadges = q('profileBadges');
  if (profBadges) {
    profBadges.innerHTML = '';
    const vipBadge = document.createElement('span');
    vipBadge.className   = 'badge badge-vip';
    vipBadge.textContent = vip.emoji + ' ' + (currentLang === 'ar' ? vip.labelAr : vip.labelEn);
    profBadges.appendChild(vipBadge);
    if (userData.founder) {
      const fb = document.createElement('span');
      fb.className   = 'badge badge-founder';
      fb.textContent = t('مؤسس 🚀', 'Founder 🚀');
      profBadges.appendChild(fb);
    }
    if (userData.telegramId) {
      const tgB = document.createElement('span');
      tgB.className   = 'badge badge-telegram';
      tgB.textContent = '✈️ Telegram';
      profBadges.appendChild(tgB);
    }
  }

  // ── أيام السلسلة ──
  renderStreakDays(streak);

  // ── شارات المستوى ──
  renderLevelBadges(bal);

  // ── الستاكينج ──
  setEl('stakingAvail', fmt(bal) + ' NDOG');

  // ── الإحالة ──
  const code = userData.referralCode || '—';
  const link = window.location.origin + window.location.pathname + '?ref=' + code;
  setEl('quickReferralCode',   code);
  setEl('referralCodeDisplay', code);
  setEl('referralLinkDisplay', link);

  // ── لافتة الأعضاء المبكرين ──
  const earlyBanner = q('earlyAdopterBanner');
  if (earlyBanner) earlyBanner.style.display = userData.founder ? 'flex' : 'none';

  // ── معدل التعدين ──
  const miningMult = vip.mult * (userData.founder ? 1.1 : 1) * (boostActive ? 2 : 1);
  setEl('miningRate', fmt(MINING_RATE * miningMult, 1) + ' NDOG/hr');
}

function renderStreakDays(streak) {
  document.querySelectorAll('.streak-day').forEach(el => {
    const day = parseInt(el.dataset.day);
    el.classList.remove('completed', 'today');
    if (day < streak) el.classList.add('completed');
    else if (day === streak) el.classList.add('today');
  });
  setEl('streakCount', streak + '/7');
}

function renderLevelBadges(balance) {
  const vipKeys = Object.keys(VIP);
  const currentVipKey = (() => {
    let k = 'bronze';
    for (const key of vipKeys) if (balance >= VIP[key].min) k = key;
    return k;
  })();
  const idx     = vipKeys.indexOf(currentVipKey);
  const nextVip = vipKeys[idx + 1];

  document.querySelectorAll('.level-badge-item').forEach((el, i) => {
    el.classList.toggle('active', vipKeys[i] === currentVipKey);
  });
  document.querySelectorAll('.level-connector').forEach((el, i) => {
    el.classList.toggle('done', i < idx);
  });

  const nextLabel = q('levelNextLabel');
  if (nextLabel) {
    nextLabel.textContent = nextVip
      ? t(`اجمع ${fmt(VIP[nextVip].min - balance)} NDOG للوصول إلى ${VIP[nextVip].labelAr}`,
          `${fmt(VIP[nextVip].min - balance)} NDOG to reach ${VIP[nextVip].labelEn}`)
      : t('لقد وصلت إلى أعلى مستوى!', "You've reached the highest level!");
  }
}

// ══════════════════════════════════════════════════════════
// 11. DAILY CLAIM
// ══════════════════════════════════════════════════════════
function claimDaily() {
  if (!currentUser || !userData) return;
  const now     = Date.now();
  const last    = userData.lastClaimAt || 0;
  const diff    = now - last;
  const COOLDOWN = 24 * 3600 * 1000;

  if (diff < COOLDOWN) {
    const hrs  = Math.floor((COOLDOWN - diff) / 3600000);
    const mins = Math.ceil((COOLDOWN - diff) / 60000);
    showToast(
      hrs > 0
        ? t(`انتظر ${hrs} ساعة و ${mins % 60} دقيقة`, `Wait ${hrs}h ${mins % 60}m`)
        : t(`انتظر ${mins} دقيقة`, `Wait ${mins} minutes`),
      'warning'
    );
    return;
  }

  showLoading();
  const vip        = getVip(userData.balance);
  let   streak     = userData.streak || 0;
  if (last > 0 && diff > 2 * COOLDOWN) streak = 0;
  streak++;
  if (streak > 7) streak = 1;

  const streakMult = getStreakMult(streak);
  const foundMult  = userData.founder ? 1.1 : 1;
  const reward     = Math.round(BASE_REWARD * vip.mult * streakMult * foundMult * 100) / 100;
  const ts         = firebase.database.ServerValue.TIMESTAMP;

  db.ref('users/' + currentUser.uid).transaction(d => {
    if (!d) return d;
    d.balance      = (Number(d.balance) || 0) + reward;
    d.streak       = streak;
    d.lastClaimAt  = ts;
    d.totalClaimed = (Number(d.totalClaimed) || 0) + reward;
    return d;
  }).then(result => {
    hideLoading();
    if (result.committed) {
      userData.lastClaimAt = Date.now();
      userData.streak      = streak;
      startCooldownTimer();
      showToast(t(`🎉 جمعت ${reward} NDOG!`, `🎉 Claimed ${reward} NDOG!`), 'success');
      const cid = db.ref().child('claims').push().key;
      db.ref('claims/' + cid).set({ uid: currentUser.uid, amount: reward, ts, type: 'daily', platform: isTelegramEnv ? 'telegram' : 'web' });
    } else {
      showToast(t('فشل الجمع', 'Claim failed'), 'error');
    }
  }).catch(() => { hideLoading(); showToast(t('خطأ', 'Error'), 'error'); });
}

function startCooldownTimer() {
  if (cooldownInterval) clearInterval(cooldownInterval);
  function tick() {
    if (!userData) return;
    const badge  = q('claimCooldownBadge');
    const timer  = q('claimTimer');
    const btn    = q('claimBtn');
    const diff   = Date.now() - (userData.lastClaimAt || 0);
    const remain = 24 * 3600 * 1000 - diff;
    if (remain <= 0) {
      if (badge) badge.style.display = 'none';
      if (btn) { btn.disabled = false; btn.querySelector('span').textContent = t('اجمع الآن', 'Claim Now'); }
    } else {
      if (badge) badge.style.display = 'block';
      if (btn)  { btn.disabled = true; btn.querySelector('span').textContent = t('قريباً', 'Soon'); }
      if (timer) {
        const h = Math.floor(remain / 3600000);
        const m = Math.floor((remain % 3600000) / 60000);
        const s = Math.floor((remain % 60000) / 1000);
        timer.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
      }
    }
  }
  tick();
  cooldownInterval = setInterval(tick, 1000);
}

// ══════════════════════════════════════════════════════════
// 12. SPIN WHEEL
// ══════════════════════════════════════════════════════════
function buildWheel() {
  const canvas = q('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const sz  = canvas.width;
  const cx  = sz / 2;
  const r   = cx - 6;
  const seg = (2 * Math.PI) / WHEEL_PRIZES.length;

  ctx.clearRect(0, 0, sz, sz);

  ctx.beginPath();
  ctx.arc(cx, cx, r + 4, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(212,160,23,0.35)';
  ctx.lineWidth   = 4;
  ctx.stroke();

  WHEEL_PRIZES.forEach((prize, i) => {
    const start = i * seg - Math.PI / 2;
    const end   = start + seg;
    ctx.beginPath(); ctx.moveTo(cx, cx); ctx.arc(cx, cx, r, start, end); ctx.closePath();
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, r);
    grad.addColorStop(0, WHEEL_COLORS[i] + '44');
    grad.addColorStop(1, WHEEL_COLORS[i]);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save();
    ctx.translate(cx, cx); ctx.rotate(start + seg / 2);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
    ctx.fillText(prize, r * 0.65, 4); ctx.restore();
  });

  const cg = ctx.createRadialGradient(cx, cx, 0, cx, cx, 28);
  cg.addColorStop(0, '#1A6BDB'); cg.addColorStop(1, '#0D1220');
  ctx.beginPath(); ctx.arc(cx, cx, 28, 0, 2 * Math.PI);
  ctx.fillStyle = cg; ctx.fill();
  ctx.strokeStyle = '#D4A017'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center'; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.fillText('NDOG', cx, cx + 3);
}

function spinWheel() {
  if (isSpinning || !currentUser || !userData) return;
  const last = userData.lastWheelSpinAt || 0;
  if (Date.now() - last < 24 * 3600 * 1000) {
    const hrs = Math.ceil((24 * 3600 * 1000 - (Date.now() - last)) / 3600000);
    showToast(t(`انتظر ${hrs} ساعة للدوران التالي`, `Wait ${hrs}h for next spin`), 'warning');
    return;
  }

  db.ref('users/' + currentUser.uid + '/lastWheelSpinAt').set(firebase.database.ServerValue.TIMESTAMP);
  isSpinning = true;
  const btn = q('spinBtn');
  if (btn) { btn.disabled = true; btn.querySelector('span').textContent = t('يدور...', 'Spinning...'); }

  const prizeIdx  = Math.floor(Math.random() * WHEEL_PRIZES.length);
  const prize     = WHEEL_PRIZES[prizeIdx];
  const segDeg    = 360 / WHEEL_PRIZES.length;
  const targetDeg = 360 - (prizeIdx * segDeg + segDeg / 2);
  const total     = wheelRotation + 1440 + targetDeg;
  wheelRotation   = total;

  const canvas = q('wheel-canvas');
  if (canvas) {
    canvas.style.transition = 'transform 4.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    canvas.style.transform  = `rotate(${total}deg)`;
  }

  setTimeout(() => {
    addBalance(prize, 'wheel_spin').then(() => {
      const spinResult = q('spinResult');
      if (spinResult) {
        spinResult.style.display = 'block';
        spinResult.textContent   = t(`🎰 فزت بـ ${prize} NDOG!`, `🎰 You won ${prize} NDOG!`);
        setTimeout(() => { spinResult.style.display = 'none'; }, 4000);
      }
      showToast(t(`🎰 فزت بـ ${prize} NDOG!`, `🎰 You won ${prize} NDOG!`), 'success');
    });
    isSpinning = false;
    if (btn) { btn.disabled = false; btn.querySelector('span').textContent = t('لفّ العجلة', 'Spin Wheel'); }
  }, 4800);
}

// ══════════════════════════════════════════════════════════
// 13. MINI GAMES
// ══════════════════════════════════════════════════════════
function playLuckyBox() {
  if (!currentUser || !userData) return;
  const last = userData.lastLuckyBoxAt || 0;
  if (Date.now() - last < 24 * 3600 * 1000) {
    showToast(t(`انتظر للصندوق التالي`, `Wait for next box`), 'warning'); return;
  }
  showLoading();
  const prize = Math.floor(Math.random() * 96) + 5;
  addBalance(prize, 'lucky_box').then(() => {
    db.ref('users/' + currentUser.uid + '/lastLuckyBoxAt').set(firebase.database.ServerValue.TIMESTAMP);
    hideLoading();
    showToast(t(`📦 ${prize} NDOG من الصندوق!`, `📦 ${prize} NDOG from the box!`), 'success');
  }).catch(() => hideLoading());
}

function playScratchCard() {
  if (!currentUser || !userData) return;
  const last = userData.lastScratchCardAt || 0;
  if (Date.now() - last < 24 * 3600 * 1000) {
    showToast(t(`انتظر للبطاقة التالية`, `Wait for next card`), 'warning'); return;
  }
  showLoading();
  const prize = Math.floor(Math.random() * 196) + 5;
  addBalance(prize, 'scratch_card').then(() => {
    db.ref('users/' + currentUser.uid + '/lastScratchCardAt').set(firebase.database.ServerValue.TIMESTAMP);
    hideLoading();
    showToast(t(`🃏 ${prize} NDOG من البطاقة!`, `🃏 Scratch card: ${prize} NDOG!`), 'success');
  }).catch(() => hideLoading());
}

function addBalance(amount, type) {
  return db.ref('users/' + currentUser.uid).transaction(d => {
    if (!d) return d;
    d.balance = (Number(d.balance) || 0) + amount;
    return d;
  }).then(result => {
    if (result.committed) {
      const txId = db.ref().child('transactions').push().key;
      return db.ref('transactions/' + txId).set({
        uid: currentUser.uid, amount, ts: firebase.database.ServerValue.TIMESTAMP, type,
        platform: isTelegramEnv ? 'telegram' : 'web',
      });
    }
    return Promise.reject('Not committed');
  });
}

// ══════════════════════════════════════════════════════════
// 14. MINING
// ══════════════════════════════════════════════════════════
function toggleMining() {
  if (!currentUser || !userData) return;
  isMining ? stopMining() : startMining();
}

function startMining() {
  isMining        = true;
  miningStartTime = Date.now();
  miningEarned    = 0;

  const btn = q('miningBtn');
  if (btn) btn.classList.add('is-mining');
  setEl('miningStateLabel', t('جاري التعدين...', 'Mining in progress...'));

  const pw = q('miningProgressWrap');
  if (pw) pw.style.display = 'block';

  const navBtn = q('navMineBtn');
  if (navBtn) navBtn.classList.add('active');

  miningInterval = setInterval(() => {
    const elapsed  = (Date.now() - miningStartTime) / 1000;
    const progress = Math.min(1, elapsed / MINING_SESSION_SECS);
    const vip      = getVip(userData?.balance || 0);
    const mult     = vip.mult * (userData?.founder ? 1.1 : 1) * (boostActive ? 2 : 1);
    miningEarned   = Math.round(MINING_RATE * mult * (elapsed / 3600) * 100) / 100;

    const fill = q('miningProgressFill');
    if (fill) fill.style.width = (progress * 100) + '%';
    const earnedEl = q('miningProgressEarned');
    if (earnedEl) earnedEl.textContent = fmt(miningEarned, 2);
    setEl('miningSessionReward', fmt(miningEarned, 2) + ' NDOG');

    if (Math.random() < 0.3) spawnMineParticle();
    if (progress >= 1) completeMiningSession();
  }, 500);

  showToast(t('بدأ التعدين! ⚡', 'Mining started! ⚡'), 'info');
}

function stopMining() {
  if (!isMining) return;
  isMining = false;
  if (miningInterval) clearInterval(miningInterval);
  miningInterval = null;

  const btn    = q('miningBtn');
  if (btn)    btn.classList.remove('is-mining');
  const navBtn = q('navMineBtn');
  if (navBtn) navBtn.classList.remove('active');

  updateMiningUI();

  if (miningEarned > 0) {
    addBalance(miningEarned, 'mining_stop').catch(() => {});
    showToast(t(`⛏️ جمعت ${fmt(miningEarned, 2)} NDOG`, `⛏️ Earned ${fmt(miningEarned, 2)} NDOG`), 'success');
    miningEarned = 0;
  }
}

function completeMiningSession() {
  if (miningInterval) clearInterval(miningInterval);
  miningInterval = null;
  isMining = false;
  const reward = miningEarned;
  miningEarned  = 0;

  const btn = q('miningBtn');
  if (btn) { btn.classList.remove('is-mining'); btn.classList.add('is-cooldown'); }
  const navBtn = q('navMineBtn');
  if (navBtn) navBtn.classList.remove('active');

  addBalance(reward, 'mining_session').then(() => {
    const sessions = (userData?.miningSessionsTotal || 0) + 1;
    db.ref('users/' + currentUser.uid + '/miningSessionsTotal').set(sessions);
    setEl('miningSessions', sessions);
    showToast(t(`🏆 جلسة مكتملة! +${fmt(reward, 2)} NDOG`, `🏆 Session complete! +${fmt(reward, 2)} NDOG`), 'success');
  });

  setTimeout(() => {
    const btn2 = q('miningBtn');
    if (btn2) btn2.classList.remove('is-cooldown');
    updateMiningUI();
  }, 3000);
}

function updateMiningUI() {
  const vip  = getVip(userData?.balance || 0);
  const mult = vip.mult * (userData?.founder ? 1.1 : 1) * (boostActive ? 2 : 1);
  setEl('miningRate', fmt(MINING_RATE * mult, 1) + ' NDOG/hr');
  setEl('miningSessions', userData?.miningSessionsTotal || 0);
  setEl('miningStateLabel', t('اضغط للتعدين', 'Tap to Mine'));
  const fill = q('miningProgressFill');
  if (fill) fill.style.width = '0%';
  const pw = q('miningProgressWrap');
  if (pw) pw.style.display = 'none';
}

function spawnMineParticle() {
  const container = q('miningParticles');
  if (!container) return;
  const emojis = ['⚡', '✨', '💰', '🐕', '⛏️'];
  const el     = document.createElement('div');
  el.className = 'mine-particle';
  el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
  const angle = Math.random() * 2 * Math.PI;
  const dist  = 60 + Math.random() * 60;
  el.style.left = '50%'; el.style.top = '50%';
  el.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
  el.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
  container.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function activateBoost() {
  showToast(t('🎬 في النسخة القادمة: شاهد إعلاناً للتعزيز', '🎬 Coming soon: Watch an ad to boost'), 'info');
  boostActive  = true;
  boostEndTime = Date.now() + BOOST_DURATION_SECS * 1000;
  const wrap = q('boostTimerWrap');
  if (wrap) wrap.style.display = 'flex';
  updateBoostTimer();
  boostTimer = setInterval(updateBoostTimer, 1000);
  updateMiningUI();
}

function updateBoostTimer() {
  const remaining = Math.max(0, boostEndTime - Date.now());
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  setEl('boostCountdown', `${pad(m)}:${pad(s)}`);
  if (remaining <= 0) {
    boostActive = false;
    if (boostTimer) clearInterval(boostTimer);
    const wrap = q('boostTimerWrap');
    if (wrap) wrap.style.display = 'none';
    updateMiningUI();
    showToast(t('انتهى التعزيز', 'Boost ended'), 'info');
  }
}

// ══════════════════════════════════════════════════════════
// 15. MISSIONS
// ══════════════════════════════════════════════════════════
function loadMissions() {
  db.ref('missions').once('value').then(snap => {
    const data = snap.val() || {};
    renderMissions('dailyMissionsList',  data.daily  || {});
    renderMissions('weeklyMissionsList', data.weekly || {});
  });
}

function renderMissions(containerId, missions) {
  const el = q(containerId);
  if (!el) return;
  el.innerHTML = '';
  const keys = Object.keys(missions);
  if (!keys.length) {
    el.innerHTML = `<div class="mission-empty">${t('لا توجد مهام حالياً', 'No missions available')}</div>`;
    return;
  }
  keys.forEach(id => {
    const m     = missions[id];
    const title = currentLang === 'ar' ? (m.title_ar || m.title) : (m.title_en || m.title);
    const desc  = currentLang === 'ar' ? (m.desc_ar  || m.desc || '') : (m.desc_en  || m.desc || '');
    const div   = document.createElement('div');
    div.className = 'mission-item';
    div.innerHTML = `
      <div class="mission-info">
        <div class="mission-title">${title}</div>
        ${desc ? `<div class="mission-desc">${desc}</div>` : ''}
        <div class="mission-reward">+${m.reward} NDOG</div>
      </div>
      <button class="btn-mini mission-claim" data-id="${id}" data-reward="${m.reward}" type="button">
        ${t('مطالبة', 'Claim')}
      </button>`;
    el.appendChild(div);
  });
  el.querySelectorAll('.mission-claim').forEach(btn => {
    btn.addEventListener('click', function () { completeMission(this.dataset.id, +this.dataset.reward); });
  });
}

function completeMission(missionId, reward) {
  if (!currentUser) return;
  const ref = db.ref('missionProgress/' + currentUser.uid + '/' + missionId);
  ref.once('value').then(snap => {
    if (snap.exists()) { showToast(t('تم إكمالها مسبقاً', 'Already completed'), 'warning'); return; }
    showLoading();
    ref.set({ completedAt: firebase.database.ServerValue.TIMESTAMP, reward })
      .then(() => addBalance(reward, 'mission_' + missionId))
      .then(() => { hideLoading(); showToast(t(`✅ مهمة مكتملة! +${reward} NDOG`, `✅ Mission done! +${reward} NDOG`), 'success'); loadMissions(); })
      .catch(() => { hideLoading(); showToast(t('فشل', 'Failed'), 'error'); });
  });
}

// ══════════════════════════════════════════════════════════
// 16. STAKING
// ══════════════════════════════════════════════════════════
function stakeTokens() {
  if (!currentUser || !userData) return;
  const input  = q('stakeAmount');
  const amount = Number(input?.value || 0);
  const plan   = STAKING[selectedPlan];
  if (!plan) return;
  if (!amount || amount <= 0) { showToast(t('أدخل مبلغاً', 'Enter amount'), 'warning'); return; }
  if (amount < plan.min)     { showToast(t(`الحد الأدنى ${plan.min} NDOG`, `Min ${plan.min} NDOG`), 'warning'); return; }
  if (amount > (userData.balance || 0)) { showToast(t('رصيد غير كافٍ', 'Insufficient balance'), 'error'); return; }

  showLoading();
  const now      = Date.now();
  const endDate  = now + plan.days * 86400000;
  const earnedRw = Math.round(amount * plan.apr * 100) / 100;
  const cid      = db.ref().child('stakingContracts').push().key;

  db.ref('users/' + currentUser.uid).transaction(d => {
    if (!d) return d;
    if ((Number(d.balance) || 0) < amount) return;
    d.balance = (Number(d.balance) || 0) - amount;
    return d;
  }).then(result => {
    if (result.committed) {
      return db.ref('stakingContracts/' + cid).set({
        uid: currentUser.uid, amount, plan: selectedPlan, apr: plan.apr, days: plan.days,
        earnedRewards: earnedRw, startDate: now, endDate, status: 'active',
      });
    }
    throw new Error('aborted');
  }).then(() => {
    hideLoading();
    if (input) input.value = '';
    showToast(t('📈 تم الإيداع!', '📈 Staked!'), 'success');
    loadStakingContracts();
  }).catch(() => { hideLoading(); showToast(t('فشل الإيداع', 'Staking failed'), 'error'); });
}

function loadStakingContracts() {
  if (!currentUser) return;
  const el = q('contractsList');
  if (!el) return;
  db.ref('stakingContracts').orderByChild('uid').equalTo(currentUser.uid).once('value').then(snap => {
    const all = snap.val() || {};
    el.innerHTML = '';
    let any = false;
    for (const cid in all) {
      const c     = all[cid];
      if (c.status !== 'active') continue;
      any = true;
      const dLeft  = Math.max(0, Math.ceil((c.endDate - Date.now()) / 86400000));
      const mature = dLeft <= 0;
      const div    = document.createElement('div');
      div.className = 'contract-item';
      div.innerHTML = `
        <div class="contract-info">
          <div class="contract-amount">${fmt(c.amount)} NDOG — ${c.plan.replace('_', ' ')}</div>
          <div class="contract-meta">${mature ? t('✅ جاهز للفك', '✅ Ready to unstake') : t(`⏳ ${dLeft} يوم متبقي`, `⏳ ${dLeft} days left`)}</div>
          <div class="contract-reward-val">+${c.earnedRewards} NDOG ${t('مكافأة', 'reward')}</div>
        </div>
        ${mature ? `<button class="btn-unstake" data-cid="${cid}" data-end="${c.endDate}" data-amt="${c.amount}" data-rw="${c.earnedRewards}" type="button">${t('فك', 'Unstake')}</button>` : ''}`;
      el.appendChild(div);
    }
    if (!any) el.innerHTML = `<div class="contracts-empty">${t('لا توجد عقود نشطة', 'No active contracts')}</div>`;
    el.querySelectorAll('.btn-unstake').forEach(btn => {
      btn.addEventListener('click', function () {
        unstake(+this.dataset.end, +this.dataset.amt, +this.dataset.rw, this.dataset.cid);
      });
    });
  });
}

function unstake(endDate, amount, earnedRw, cid) {
  if (Date.now() < endDate) { showToast(t('لم ينضج بعد', 'Not mature yet'), 'warning'); return; }
  showLoading();
  const total = amount + earnedRw;
  addBalance(total, 'unstake')
    .then(() => db.ref('stakingContracts/' + cid + '/status').set('completed'))
    .then(() => { hideLoading(); showToast(t(`✅ +${total} NDOG`, `✅ +${total} NDOG`), 'success'); loadStakingContracts(); })
    .catch(() => { hideLoading(); showToast(t('فشل', 'Failed'), 'error'); });
}

// ══════════════════════════════════════════════════════════
// 17. LEADERBOARD
// ══════════════════════════════════════════════════════════
function loadLeaderboard() {
  const el = q('topBalanceList');
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-3)">⏳</div>`;
  db.ref('users').orderByChild('balance').limitToLast(20).once('value').then(snap => {
    const users = [];
    snap.forEach(c => users.push({ ...c.val(), uid: c.key }));
    users.reverse();
    el.innerHTML = '';
    users.forEach((u, i) => {
      const rank  = i + 1;
      const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const isMe  = currentUser && u.uid === currentUser.uid;
      const tgTag = u.telegramUsername ? ` @${u.telegramUsername}` : '';
      const div   = document.createElement('div');
      div.className = 'leader-item' + (isMe ? ' is-me' : '');
      div.innerHTML = `
        <span class="leader-rank">${emoji}</span>
        <span class="leader-name${isMe ? ' is-me' : ''}">${u.displayName || t('مستخدم', 'User')}${tgTag}${isMe ? ' ⭐' : ''}</span>
        <span class="leader-val">${fmt(u.balance || 0)} NDOG</span>`;
      el.appendChild(div);
    });
  });
}

// ══════════════════════════════════════════════════════════
// 18. REFERRAL
// ══════════════════════════════════════════════════════════
function loadReferralCount() {
  if (!currentUser) return;
  db.ref('referrals/' + currentUser.uid).on('value', snap => {
    setEl('referralCount', snap.numChildren());
  });
}

function applyReferralCode(code) {
  if (!currentUser || !code) return Promise.resolve();
  return db.ref('referralCodes/' + code).once('value').then(snap => {
    if (!snap.exists()) { showToast(t('كود غير صالح', 'Invalid code'), 'error'); return; }
    const ref = snap.val();
    if (ref.uid === currentUser.uid) { showToast(t('كودك الخاص!', 'Your own code!'), 'warning'); return; }
    return db.ref('users/' + currentUser.uid + '/referredBy').once('value').then(rs => {
      if (rs.exists()) { showToast(t('لديك كود بالفعل', 'Already have a referral'), 'warning'); return; }
      const now = Date.now();
      const upd = {};
      upd[`users/${currentUser.uid}/referredBy`]          = ref.uid;
      upd[`referrals/${ref.uid}/${currentUser.uid}`]      = { referredAt: now, email: currentUser.email || '' };
      return db.ref().update(upd).then(() => {
        referralChain(ref.uid, currentUser.uid, now, 1);
        showToast(t('✅ كود مطبّق! +50 NDOG', '✅ Code applied! +50 NDOG'), 'success');
        setTimeout(() => { if (userData) { renderDashboard(); loadReferralCount(); } }, 500);
      }).catch(console.error);
    });
  }).catch(console.error);
}

function referralChain(refUid, newUid, now, level) {
  if (level > 3 || !REF_BONUSES[level]) return;
  const bonus = REF_BONUSES[level];
  db.ref('users/' + refUid).transaction(d => {
    if (!d) return d;
    d.balance = (Number(d.balance) || 0) + bonus;
    return d;
  });
  db.ref('users/' + refUid + '/referredBy').once('value').then(s => {
    if (s.exists()) referralChain(s.val(), newUid, now, level + 1);
  });
}

function shareReferral(platform) {
  if (!userData) return;
  const code = userData.referralCode || '';

  // داخل تيليجرام: استخدم t.me/BotName?start=CODE
  let webLink, tgLink;
  webLink = window.location.origin + window.location.pathname + '?ref=' + code;

  const text = encodeURIComponent(t('انضم إلى NDOG Coin واكسب مجانًا! 🐕', 'Join NDOG Coin and earn for free! 🐕'));

  if (platform === 'telegram') {
    // فتح واجهة مشاركة تيليجرام الرسمية
    window.open(`https://t.me/share/url?url=${encodeURIComponent(webLink)}&text=${text}`, '_blank');
    return;
  }

  const link = encodeURIComponent(webLink);
  const urls = {
    whatsapp: `https://wa.me/?text=${text}%20${link}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${link}`,
    x:        `https://twitter.com/intent/tweet?text=${text}&url=${link}`,
  };
  if (urls[platform]) window.open(urls[platform], '_blank');
}

// ══════════════════════════════════════════════════════════
// 19. AIRDROP
// ══════════════════════════════════════════════════════════
function claimAirdrop() {
  if (!currentUser) return;
  showLoading();
  db.ref('airdropClaims/' + currentUser.uid).once('value').then(snap => {
    if (snap.exists()) { hideLoading(); showToast(t('تم الجمع مسبقاً', 'Already claimed'), 'warning'); return; }
    return db.ref('config/airdrop').once('value').then(cfg => {
      if (!cfg.exists()) { hideLoading(); showToast(t('غير متاح حالياً', 'Not available'), 'warning'); return; }
      const a = cfg.val();
      if (!a.active || (a.amount || 0) <= 0) { hideLoading(); showToast(t('غير نشط', 'Inactive'), 'warning'); return; }
      return addBalance(a.amount, 'airdrop')
        .then(() => db.ref('airdropClaims/' + currentUser.uid).set({ claimedAt: firebase.database.ServerValue.TIMESTAMP, amount: a.amount }))
        .then(() => { hideLoading(); showToast(t('🎁 الإسقاط الجوي! ✅', '🎁 Airdrop claimed! ✅'), 'success'); });
    });
  }).catch(() => hideLoading());
}

function loadAirdropInfo() {
  db.ref('config/airdrop').once('value').then(snap => {
    const d  = snap.val() || {};
    const el = q('airdropStatus');
    if (el) el.textContent = d.active
      ? t('🟢 نشط — ' + fmt(d.amount || 0) + ' NDOG', '🟢 Active — ' + fmt(d.amount || 0) + ' NDOG')
      : t('🔴 غير نشط', '🔴 Inactive');
  });
}

// ══════════════════════════════════════════════════════════
// 20. NEWS
// ══════════════════════════════════════════════════════════
function loadNews() {
  const el = q('newsList');
  if (!el) return;
  db.ref('news').orderByChild('createdAt').once('value').then(snap => {
    const arts = [];
    snap.forEach(c => arts.push({ ...c.val(), id: c.key }));
    arts.reverse();
    el.innerHTML = '';
    if (!arts.length) {
      el.innerHTML = `<div class="news-item" style="color:var(--text-3);text-align:center">${t('لا توجد أخبار', 'No news')}</div>`;
      return;
    }
    arts.forEach(a => {
      const title   = currentLang === 'ar' ? (a.title_ar || a.title) : (a.title_en || a.title);
      const content = currentLang === 'ar' ? (a.content_ar || a.content) : (a.content_en || a.content);
      const newsDate = a.createdAt || a.date || a.publishedAt;
      const date     = newsDate ? new Date(newsDate).toLocaleDateString(currentLang === 'ar' ? 'ar-EG' : 'en-US') : '';
      const time     = newsDate ? new Date(newsDate).toLocaleTimeString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '';
      const div = document.createElement('div');
      div.className = 'news-item';
      div.innerHTML = `
        <div class="news-title">${title}</div>
        ${date ? `<div class="news-date">${date}  ${time}</div>` : ''}
        <div class="news-body">${content}</div>`;
      el.appendChild(div);
    });
  });
}

// ══════════════════════════════════════════════════════════
// 21. FAQ
// ══════════════════════════════════════════════════════════
function loadFaq() {
  const el = q('faqList');
  if (!el) return;
  db.ref('faq').once('value').then(snap => {
    const items = [];
    snap.forEach(c => items.push({ ...c.val(), id: c.key }));
    el.innerHTML = '';
    if (!items.length) {
      el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3)">${t('لا توجد أسئلة', 'No FAQ')}</div>`;
      return;
    }
    items.forEach(item => {
      const ques = currentLang === 'ar' ? (item.q_ar || item.question) : (item.q_en || item.question);
      const ans  = currentLang === 'ar' ? (item.a_ar || item.answer)   : (item.a_en || item.answer);
      const div  = document.createElement('div');
      div.className = 'faq-item';
      div.innerHTML = `
        <button class="faq-btn" type="button">
          <span>${ques}</span><span class="faq-arrow">▼</span>
        </button>
        <div class="faq-answer"><div class="faq-answer-inner">${ans}</div></div>`;
      el.appendChild(div);
    });
    el.querySelectorAll('.faq-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const ans  = this.nextElementSibling;
        const open = ans.style.maxHeight && ans.style.maxHeight !== '0px';
        el.querySelectorAll('.faq-answer').forEach(a => { a.style.maxHeight = '0px'; });
        el.querySelectorAll('.faq-btn').forEach(b => b.classList.remove('open'));
        if (!open) { ans.style.maxHeight = ans.scrollHeight + 20 + 'px'; this.classList.add('open'); }
      });
    });
  });
}

// ══════════════════════════════════════════════════════════
// 22. NAVIGATION
// ══════════════════════════════════════════════════════════
function switchTab(tabName) {
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
  const target = q('tab' + capitalize(tabName));
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (tabName === 'rewards')  { loadMissions(); loadLeaderboard(); loadAirdropInfo(); }
  if (tabName === 'wallet')   { loadStakingContracts(); }
  if (tabName === 'profile')  { loadReferralCount(); loadFaq(); }
  if (tabName === 'mining')   { updateMiningUI(); }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ══════════════════════════════════════════════════════════
// 23. BACKGROUND CANVAS
// ══════════════════════════════════════════════════════════
function initBgCanvas() {
  const canvas = q('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];

  function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  const count = Math.min(50, Math.floor(window.innerWidth * window.innerHeight / 20000));
  for (let i = 0; i < count; i++) {
    const gold = Math.random() > 0.55;
    particles.push({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.8 + 0.3,
      dx: (Math.random() - 0.5) * 0.25, dy: (Math.random() - 0.5) * 0.25,
      color: gold
        ? `rgba(212,160,23,${Math.random() * 0.2 + 0.05})`
        : `rgba(26,107,219,${Math.random() * 0.15 + 0.04})`,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > w) p.dx *= -1;
      if (p.y < 0 || p.y > h) p.dy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ══════════════════════════════════════════════════════════
// 24. URL REFERRAL DETECTION
// ══════════════════════════════════════════════════════════
function detectRefFromUrl() {
  // ── من رابط الويب ──
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref) {
    localStorage.setItem('ndog_ref', ref);
    const url = new URL(window.location);
    url.searchParams.delete('ref');
    window.history.replaceState({}, '', url.toString());
  }

  // ── من رابط Telegram (start_param) ──
  if (tgApp?.initDataUnsafe?.start_param) {
    const tgRef = tgApp.initDataUnsafe.start_param;
    if (tgRef && !localStorage.getItem('ndog_ref')) {
      localStorage.setItem('ndog_ref', tgRef);
    }
  }
}

// ══════════════════════════════════════════════════════════
// 25. EVENT WIRING
// ══════════════════════════════════════════════════════════
function wireEvents() {
  // تسجيل الدخول
  q('googleSignInBtn')?.addEventListener('click', loginGoogle);

  // اللغة
  q('langBtnLogin')?.addEventListener('click', toggleLang);
  q('langBtnApp')?.addEventListener('click', toggleLang);

  // تسجيل الخروج
  q('logoutBtn')?.addEventListener('click', logout);
  q('logoutBtnFull')?.addEventListener('click', logout);

  // ربط تيليجرام (زر في الملف الشخصي)
  q('linkTelegramBtn')?.addEventListener('click', () => {
    if (!tgApp?.initData) {
      showToast(t('افتح التطبيق من خلال بوت تيليجرام للربط', 'Open via Telegram bot to link'), 'info');
      return;
    }
    linkTelegramToCurrentAccount();
  });

  // جمع المكافأة اليومية
  q('claimBtn')?.addEventListener('click', claimDaily);

  // عجلة الحظ
  q('spinBtn')?.addEventListener('click', spinWheel);

  // الألعاب الصغيرة
  q('luckyBoxBtn')?.addEventListener('click', e => { e.stopPropagation(); playLuckyBox(); });
  q('scratchBtn')?.addEventListener('click', e => { e.stopPropagation(); playScratchCard(); });

  // التعدين
  q('miningBtn')?.addEventListener('click', toggleMining);
  q('navMineBtn')?.addEventListener('click', () => { switchTab('mining'); setTimeout(() => q('miningBtn')?.click(), 100); });

  // التعزيز
  q('boostBtn')?.addEventListener('click', activateBoost);

  // الستاكينج
  q('stakeBtn')?.addEventListener('click', stakeTokens);
  q('stakeMaxBtn')?.addEventListener('click', () => {
    const inp = q('stakeAmount');
    if (inp && userData) inp.value = Math.floor(userData.balance || 0);
  });
  document.querySelectorAll('.plan-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('active-plan'));
      card.classList.add('active-plan');
      const input = card.querySelector('input');
      if (input) selectedPlan = input.value + '_days';
    });
  });

  // المحفظة
  q('walletSendBtn')?.addEventListener('click', () => showToast(t('قريباً', 'Coming soon'), 'info'));
  q('walletReceiveBtn')?.addEventListener('click', () => {
    if (!userData) return;
    copyText(userData.referralCode || '—', t('📋 تم نسخ الكود!', '📋 Code copied!'));
  });

  // أزرار النسخ
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', function () {
      const type = this.dataset.copy;
      if (!userData) return;
      if (type === 'code' || type === 'referralCode') {
        copyText(userData.referralCode || '', t('📋 تم نسخ الكود!', '📋 Code copied!'));
      }
      if (type === 'referralLink') {
        const link = window.location.origin + window.location.pathname + '?ref=' + (userData.referralCode || '');
        copyText(link, t('🔗 تم نسخ الرابط!', '🔗 Link copied!'));
      }
    });
  });

  // تطبيق كود الإحالة يدويًا
  q('applyReferralBtn')?.addEventListener('click', () => {
    const inp  = q('referralCodeInput');
    const code = inp?.value.trim();
    if (!code) { showToast(t('أدخل كوداً', 'Enter a code'), 'warning'); return; }
    applyReferralCode(code).then(() => { if (inp) inp.value = ''; });
  });

  // الإسقاط الجوي
  q('airdropClaimBtn')?.addEventListener('click', claimAirdrop);

  // مشاركة الإحالة
  document.querySelectorAll('[data-platform]').forEach(btn => {
    btn.addEventListener('click', function () { shareReferral(this.dataset.platform); });
  });

  // التنقل السفلي
  document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', function () {
      if (this.dataset.tab !== 'mining') switchTab(this.dataset.tab);
    });
  });

  // إغلاق المودال
  q('walletModal')?.addEventListener('click', function (e) {
    if (e.target === this) this.style.display = 'none';
  });

  // زر الرجوع في تيليجرام
  if (tgApp) {
    tgApp.BackButton.onClick(() => {
      const active = document.querySelector('.tab-view.active');
      if (active && active.id !== 'tabHome') {
        switchTab('home');
        tgApp.BackButton.hide();
      } else {
        tgApp.close();
      }
    });

    // إظهار زر الرجوع عند التنقل
    document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
      btn.addEventListener('click', function () {
        if (this.dataset.tab === 'home') tgApp.BackButton.hide();
        else tgApp.BackButton.show();
      });
    });
  }
}

// ══════════════════════════════════════════════════════════
// 26. BOOT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  applyLang();
  wireEvents();
  initBgCanvas();
  showLoading();

  // ── كشف بيئة تيليجرام ──
  tgApp       = window.Telegram?.WebApp;
  isTelegramEnv = !!(tgApp && tgApp.initData);

  // ── كشف كود الإحالة من الـ URL أو Telegram ──
  detectRefFromUrl();

  if (isTelegramEnv) {
    // ── داخل تيليجرام: ابدأ مصادقة تيليجرام مباشرة ──
    await initTelegramAuth();
  } else {
    // ── خارج تيليجرام: انتظر onAuthStateChanged ──
    // (يُطلَق تلقائيًا بعد DOMContentLoaded)
  }
});
