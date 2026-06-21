// app.js - الموديول الرئيسي
import { loginWithGoogle, logout, onAuth, getUserData, updateUser } from './auth.js';
import { readData, updateData, listenData, pushData } from './database.js';
import { showToast, switchView, loadTranslations, toggleLanguage, animateCounter } from './ui.js';
import { initParticles } from './particles.js';
import { animateNumber } from './animations.js';
import { getDeviceFingerprint, logFraud } from './security.js';
import { initClaimSystem } from './claim.js';
import { initReferralSystem } from './referrals.js';
import { initMissions } from './missions.js';
import { initLeaderboard } from './leaderboard.js';
import { initStaking } from './staking.js';
import { initAirdrop } from './airdrop.js';

let currentUser = null;
let userData = null;

// 1. تهيئة الخلفية والترجمة
initParticles();
await loadTranslations();

// 2. مراقبة حالة المصادقة
onAuth(async (user) => {
  const loginScreen = document.getElementById('loginScreen');
  const appShell = document.getElementById('appShell');
  const preloader = document.getElementById('preloader');

  if (user) {
    currentUser = user;
    userData = await getUserData(user.uid);
    
    // التحقق من الحظر
    if (userData?.banned) {
      document.getElementById('bannedModal').classList.remove('hidden');
      return;
    }

    loginScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    preloader.classList.add('done');
    setTimeout(() => preloader.remove(), 500);

    // تحديث الواجهة
    updateUI(userData);
    // تهيئة الأنظمة
    initClaimSystem(user.uid);
    initReferralSystem(user.uid);
    initMissions(user.uid);
    initLeaderboard();
    initStaking(user.uid);
    initAirdrop(user.uid);

    // استعادة آخر عرض
    const lastView = localStorage.getItem('ndog_last_view') || 'dashboard';
    switchView(lastView);

  } else {
    loginScreen.classList.remove('hidden');
    appShell.classList.add('hidden');
    preloader.classList.add('done');
    setTimeout(() => preloader.remove(), 500);
  }
});

// 3. أحداث الأزرار
document.getElementById('googleLoginBtn').addEventListener('click', async () => {
  try {
    await loginWithGoogle();
    showToast('مرحباً بك في NileDogs!', 'success');
  } catch (e) {
    showToast('فشل تسجيل الدخول: ' + e.message, 'error');
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await logout();
  showToast('تم تسجيل الخروج بنجاح', 'info');
});

document.getElementById('bannedLogout').addEventListener('click', async () => {
  await logout();
  location.reload();
});

// 4. التنقل
document.querySelectorAll('.nav-link, .bn-link, [data-view]').forEach(el => {
  el.addEventListener('click', (e) => {
    const view = el.dataset.view;
    if (view) {
      e.preventDefault();
      switchView(view);
    }
  });
});

// 5. تبديل اللغة
document.getElementById('langToggle').addEventListener('click', toggleLanguage);
document.querySelectorAll('.lang-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    const lang = btn.dataset.lang;
    loadTranslations(lang);
    document.dir = lang === 'ar' ? 'rtl' : 'ltr';
  });
});

// 6. القائمة الجانبية
document.getElementById('menuToggle').addEventListener('click', () => {
  const nav = document.getElementById('sidenav');
  const scrim = document.getElementById('sidenavScrim');
  nav.classList.toggle('open');
  scrim.classList.toggle('active');
});
document.getElementById('sidenavScrim').addEventListener('click', () => {
  document.getElementById('sidenav').classList.remove('open');
  document.getElementById('sidenavScrim').classList.remove('active');
});

// 7. دالة تحديث الواجهة
function updateUI(data) {
  if (!data) return;
  // تحديث الصور الشخصية
  document.querySelectorAll('.dash__avatar, .sidenav__avatar').forEach(el => {
    el.src = data.photoURL || 'https://ui-avatars.com/api/?name=' + (data.displayName || 'U');
  });
  document.getElementById('dashName').textContent = data.displayName || 'مستخدم';
  document.getElementById('sideName').textContent = data.displayName || 'مستخدم';
  document.getElementById('sideCode').textContent = data.referralCode || 'NDOG—';
  document.getElementById('dashRefCode').textContent = data.referralCode || 'NDOG—';
  document.getElementById('dashRefLink').textContent = `https://ndogcoin.com/?ref=${data.referralCode || ''}`;
  document.getElementById('dashJoined').textContent = `Member since ${new Date(data.createdAt).toLocaleDateString()}`;
  document.getElementById('dashCountry').textContent = '🌍 ' + (data.country || 'Global');
  
  // عدادات
  animateCounter(document.getElementById('statBalance'), data.balance || 0);
  animateCounter(document.getElementById('statCommunity'), data.communityScore || 0);
  animateCounter(document.getElementById('statLoyalty'), data.loyaltyScore || 0);
  animateCounter(document.getElementById('statRefs'), data.totalReferrals || 0);
  document.getElementById('topbarBalNum').textContent = (data.balance || 0).toLocaleString();

  // الرتبة
  const rankMap = { bronze: '🥉 برونزي', silver: '🥈 فضي', gold: '🥇 ذهبي', diamond: '💎 ماسي', legend: '👑 أسطورة' };
  document.getElementById('dashRankName').textContent = rankMap[data.rank] || 'برونزي';
}