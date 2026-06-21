// ui.js - إدارة الواجهة والترجمة
import { onAuth, getUserData } from './auth.js';
import { readData } from './database.js';

let currentLang = localStorage.getItem('ndog_lang') || 'ar';
let translations = {};

export async function loadTranslations(lang = currentLang) {
  try {
    const res = await fetch(`./locales/${lang}.json`);
    if (!res.ok) throw new Error('Language file not found');
    translations = await res.json();
    currentLang = lang;
    localStorage.setItem('ndog_lang', lang);
    applyTranslations();
    return translations;
  } catch (e) {
    console.warn('Fallback to Arabic', e);
    const res = await fetch('./locales/ar.json');
    translations = await res.json();
    applyTranslations();
    return translations;
  }
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = key.split('.').reduce((o, k) => o?.[k], translations);
    if (val) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = val;
      else el.textContent = val;
    }
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    const val = key.split('.').reduce((o, k) => o?.[k], translations);
    if (val) el.innerHTML = val;
  });
  document.getElementById('langToggleLbl').textContent = currentLang.toUpperCase();
}

export function toggleLanguage() {
  const next = currentLang === 'ar' ? 'en' : 'ar';
  loadTranslations(next);
  document.dir = next === 'ar' ? 'rtl' : 'ltr';
  // تحديث اتجاه الصفحة
}

export function showToast(message, type = 'info') {
  const host = document.getElementById('toastHost');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    background: ${type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : '#3498db'};
    color: #fff; padding: 12px 24px; border-radius: 12px; margin-bottom: 8px;
    font-weight: 600; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease;
  `;
  host.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

export function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('view--active'));
  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add('view--active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`.nav-link[data-view="${viewId}"]`)?.classList.add('active');
  document.querySelectorAll('.bn-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`.bn-link[data-view="${viewId}"]`)?.classList.add('active');
  // حفظ آخر عرض
  localStorage.setItem('ndog_last_view', viewId);
}

export function animateCounter(element, target, suffix = '') {
  if (!element) return;
  let current = 0;
  const step = Math.max(1, Math.floor(target / 60));
  const interval = setInterval(() => {
    current += step;
    if (current >= target) {
      clearInterval(interval);
      current = target;
    }
    element.textContent = current.toLocaleString() + suffix;
  }, 16);
}