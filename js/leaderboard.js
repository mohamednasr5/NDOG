// leaderboard.js - لوحة المتصدرين
import { db } from './firebase.js';
import { ref, onValue, query, orderByChild, limitToLast } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

export function initLeaderboard() {
  loadLeaderboard('global');
  setupLeaderboardTabs();
}

function setupLeaderboardTabs() {
  document.querySelectorAll('[data-ltab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-ltab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadLeaderboard(tab.dataset.ltab);
    });
  });
}

function loadLeaderboard(type) {
  const podium = document.getElementById('lbPodium');
  const list = document.getElementById('lbList');
  if (!podium || !list) return;

  const usersRef = ref(db, 'users');
  onValue(usersRef, (snap) => {
    const users = snap.val() || {};
    const sorted = Object.values(users)
      .filter(u => u.balance !== undefined && !u.banned)
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .slice(0, 10);

    // المنصة (الثلاثة الأوائل)
    const podiumHtml = sorted.slice(0, 3).map((u, i) => {
      const cls = ['gold', 'silver', 'bronze'][i];
      const emoji = ['🥇', '🥈', '🥉'][i];
      return `
        <div class="place ${cls}" style="text-align:center;background:rgba(10,31,68,0.7);padding:16px;border-radius:20px;width:100px;">
          <div>${emoji}</div>
          <div>${u.displayName || 'مجهول'}</div>
          <div style="color:#ffd700;">${u.balance || 0}</div>
        </div>
      `;
    }).join('');
    podium.innerHTML = podiumHtml || '<div class="empty">لا توجد بيانات</div>';

    // القائمة (4-10)
    const listHtml = sorted.slice(3).map((u, i) => `
      <div class="lb-entry" style="display:flex;justify-content:space-between;padding:12px 16px;background:rgba(10,31,68,0.5);border-radius:16px;margin-bottom:8px;border:1px solid rgba(255,215,0,0.1);">
        <span style="color:#ffd700;font-weight:bold;width:40px;">#${i+4}</span>
        <span style="flex:1;">${u.displayName || 'مجهول'}</span>
        <span style="color:#2ecc71;">${u.balance || 0} NDOG</span>
      </div>
    `).join('');
    list.innerHTML = listHtml || '<div class="empty">لا توجد بيانات كافية</div>';
  });
}