// admin.js - منطق المسؤول
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { ref, get, update, remove, onValue } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { showToast } from './ui.js';

export function initAdminPanel() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = './'; return; }
    const snap = await get(ref(db, `users/${user.uid}`));
    const data = snap.val();
    if (data?.role !== 'admin' && data?.role !== 'superadmin') {
      alert('غير مصرح لك بالدخول.');
      window.location.href = './';
      return;
    }
    // تحميل البيانات
    loadUsers();
  });

  document.querySelectorAll('.tab-admin').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-admin').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      if (name === 'users') loadUsers();
      else if (name === 'analytics') loadAnalytics();
      else if (name === 'fraud') loadFraud();
    });
  });
}

async function loadUsers() {
  const snap = await get(ref(db, 'users'));
  const users = snap.val() || {};
  const html = Object.entries(users).map(([uid, u]) => `
    <div class="admin-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong>${u.displayName || 'مجهول'}</strong>
          <div style="font-size:12px;color:#b0c4de;">${u.email || ''}</div>
          <div>الرصيد: ${u.balance || 0} NDOG</div>
        </div>
        <div>
          <span class="badge ${u.banned ? 'badge-banned' : (u.role === 'admin' ? 'badge-admin' : 'badge-user')}">${u.banned ? 'محظور' : (u.role || 'مستخدم')}</span>
          <div style="margin-top:6px;">
            <button class="btn-sm btn-ban" data-uid="${uid}">حظر</button>
            <button class="btn-sm btn-unban" data-uid="${uid}">إلغاء</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
  document.getElementById('usersGrid').innerHTML = html;

  // إضافة المستمعين للأزرار
  document.querySelectorAll('.btn-ban').forEach(b => b.addEventListener('click', () => banUser(b.dataset.uid)));
  document.querySelectorAll('.btn-unban').forEach(b => b.addEventListener('click', () => unbanUser(b.dataset.uid)));
}

async function banUser(uid) {
  await update(ref(db, `users/${uid}`), { banned: true });
  showToast('تم حظر المستخدم', 'success');
  loadUsers();
}

async function unbanUser(uid) {
  await update(ref(db, `users/${uid}`), { banned: false });
  showToast('تم إلغاء حظر المستخدم', 'success');
  loadUsers();
}

async function loadAnalytics() {
  const snap = await get(ref(db, 'analytics'));
  const data = snap.val() || {};
  document.getElementById('usersGrid').innerHTML = `
    <div class="admin-card"><h3>إجمالي المستخدمين</h3><div class="stat">${data.totalUsers || 0}</div></div>
    <div class="admin-card"><h3>إجمالي المطالبات</h3><div class="stat">${data.totalClaims || 0}</div></div>
    <div class="admin-card"><h3>إجمالي NDOG الموزع</h3><div class="stat">${data.totalDistributed || 0}</div></div>
  `;
}

async function loadFraud() {
  const snap = await get(ref(db, 'fraudLogs'));
  const logs = snap.val() || {};
  const html = Object.entries(logs).map(([k, l]) => `
    <div class="admin-card"><pre style="font-size:12px;color:#b0c4de;">${JSON.stringify(l, null, 2)}</pre></div>
  `).join('');
  document.getElementById('usersGrid').innerHTML = html || '<div class="admin-card">لا توجد سجلات احتيال.</div>';
}