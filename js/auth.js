// js/auth.js
import { auth, db } from '../firebase/firebase-config.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  ref,
  get,
  child
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const $ = (selector) => document.querySelector(selector);

const loginForm =
  $('#loginForm') ||
  $('#adminLoginForm') ||
  $('form');

const emailInput =
  $('#email') ||
  $('#loginEmail') ||
  $('input[type="email"]');

const passwordInput =
  $('#password') ||
  $('#loginPassword') ||
  $('input[type="password"]');

const submitBtn =
  $('#loginBtn') ||
  $('button[type="submit"]');

const errorBox = ensureMessageBox('auth-error', '#dc2626');
const successBox = ensureMessageBox('auth-success', '#065f46');

let authResolved = false;
let navigating = false;

function ensureMessageBox(id, color) {
  let box = document.getElementById(id);
  if (!box) {
    box = document.createElement('div');
    box.id = id;
    box.style.display = 'none';
    box.style.marginTop = '12px';
    box.style.padding = '12px 14px';
    box.style.borderRadius = '10px';
    box.style.fontSize = '14px';
    box.style.lineHeight = '1.5';
    box.style.background = color === '#dc2626' ? '#fef2f2' : '#ecfdf5';
    box.style.color = color;
    box.style.border = `1px solid ${color}22`;

    if (loginForm) {
      loginForm.appendChild(box);
    } else {
      document.body.appendChild(box);
    }
  }
  return box;
}

function showError(message) {
  successBox.style.display = 'none';
  errorBox.textContent = message;
  errorBox.style.display = 'block';
  hideBlockingLayers();
  setLoading(false);
  console.error('[AUTH ERROR]', message);
}

function showSuccess(message) {
  errorBox.style.display = 'none';
  successBox.textContent = message;
  successBox.style.display = 'block';
}

function setLoading(loading) {
  if (submitBtn) {
    submitBtn.disabled = loading;
    submitBtn.dataset.originalText ||= submitBtn.textContent;
    submitBtn.textContent = loading ? 'جاري تسجيل الدخول...' : submitBtn.dataset.originalText;
  }

  document.body.classList.toggle('is-auth-loading', loading);
  document.body.style.pointerEvents = loading ? 'none' : '';
  document.body.style.opacity = loading ? '0.98' : '';
}

function hideBlockingLayers() {
  const suspects = [
    '.loader',
    '.loading',
    '.loading-screen',
    '.splash',
    '.overlay',
    '.screen-overlay',
    '#loader',
    '#loading',
    '#loadingScreen',
    '#splash',
    '#overlay'
  ];

  suspects.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    });
  });

  document.body.style.overflow = '';
}

async function getUserProfile(uid) {
  try {
    const snapshot = await get(child(ref(db), `users/${uid}`));
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.warn('Profile fetch failed:', error);
    return null;
  }
}

async function resolveRedirect(user) {
  const profile = await getUserProfile(user.uid);

  if (profile?.role === 'admin' || profile?.isAdmin === true) {
    return './admin.html';
  }

  if (profile?.role === 'organizer') {
    return './dashboard.html';
  }

  return './index.html';
}

async function safeRedirect(user) {
  try {
    navigating = true;
    const target = await resolveRedirect(user);
    showSuccess('تم تسجيل الدخول بنجاح، جارٍ التحويل...');
    hideBlockingLayers();

    setTimeout(() => {
      window.location.href = target;
    }, 300);
  } catch (error) {
    navigating = false;
    console.error('Redirect error:', error);
    showError('تم تسجيل الدخول لكن حدث خطأ أثناء فتح الصفحة التالية.');
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const email = emailInput?.value?.trim();
  const password = passwordInput?.value ?? '';

  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  if (!email || !password) {
    showError('من فضلك أدخل البريد الإلكتروني وكلمة المرور.');
    return;
  }

  try {
    setLoading(true);
    hideBlockingLayers();

    const result = await signInWithEmailAndPassword(auth, email, password);
    await safeRedirect(result.user);
  } catch (error) {
    console.error('Login failed:', error);

    const map = {
      'auth/invalid-email': 'البريد الإلكتروني غير صحيح.',
      'auth/user-not-found': 'هذا الحساب غير موجود.',
      'auth/wrong-password': 'كلمة المرور غير صحيحة.',
      'auth/invalid-credential': 'بيانات الدخول غير صحيحة.',
      'auth/too-many-requests': 'تم تقييد المحاولات مؤقتًا، حاول بعد قليل.',
      'auth/network-request-failed': 'مشكلة في الاتصال بالإنترنت أو Firebase.',
      'auth/missing-password': 'أدخل كلمة المرور.'
    };

    showError(map[error.code] || `فشل تسجيل الدخول: ${error.message}`);
  } finally {
    if (!navigating) {
      setLoading(false);
    }
  }
}

onAuthStateChanged(auth, async (user) => {
  authResolved = true;
  hideBlockingLayers();

  const onLoginPage =
    window.location.pathname.includes('login') ||
    !!loginForm;

  if (!user) {
    setLoading(false);
    return;
  }

  if (onLoginPage && !navigating) {
    await safeRedirect(user);
  } else {
    setLoading(false);
  }
});

if (loginForm) {
  loginForm.addEventListener('submit', handleLogin);
}

window.addEventListener('load', () => {
  setTimeout(() => {
    hideBlockingLayers();
    if (!authResolved) {
      setLoading(false);
    }
  }, 1500);
});

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error || event.message);
  showError('حدث خطأ غير متوقع في الصفحة. راجع Console.');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showError('حدث خطأ أثناء تنفيذ العملية. راجع Console.');
});

window.ndogLogout = async function () {
  try {
    await signOut(auth);
    window.location.href = './login.html';
  } catch (error) {
    console.error('Logout failed:', error);
    showError('تعذر تسجيل الخروج.');
  }
};
