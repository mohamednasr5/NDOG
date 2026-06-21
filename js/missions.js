// missions.js - نظام المهام
import { db } from './firebase.js';
import { ref, get, update, push } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { getUserData, updateUser } from './auth.js';
import { showToast } from './ui.js';

let uid = null;

export function initMissions(userId) {
  uid = userId;
  loadMissions('daily');
  setupMissionTabs();
}

function setupMissionTabs() {
  document.querySelectorAll('[data-mtab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-mtab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadMissions(tab.dataset.mtab);
    });
  });
}

async function loadMissions(type) {
  if (!uid) return;
  const missionsSnap = await get(ref(db, `missions/${type}`));
  const missions = missionsSnap.val() || {};
  const userData = await getUserData(uid);
  const userMissions = userData?.missions || {};

  const list = document.getElementById('missionsList');
  const html = Object.entries(missions).map(([key, m]) => {
    const completed = userMissions[`${type}_${key}`] || false;
    return `
      <div class="mission-card glass" style="padding:16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong>${m.name}</strong>
          <p style="font-size:13px;color:#b0c4de;">${m.desc}</p>
          <span style="color:#ffd700;">+${m.reward} NDOG</span>
        </div>
        <button class="btn btn--gold btn--sm mission-btn" data-key="${key}" data-type="${type}" ${completed ? 'disabled' : ''}>
          ${completed ? '✅ تم' : 'إنجاز'}
        </button>
      </div>
    `;
  }).join('') || '<div class="empty">لا توجد مهام حالياً.</div>';
  list.innerHTML = html;

  // إضافة أحداث النقر
  list.querySelectorAll('.mission-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const type = btn.dataset.type;
      await completeMission(type, key);
    });
  });
}

async function completeMission(type, key) {
  if (!uid) return;
  const missionRef = ref(db, `missions/${type}/${key}`);
  const snap = await get(missionRef);
  const mission = snap.val();
  if (!mission) return;

  const userData = await getUserData(uid);
  const userMissions = userData?.missions || {};
  if (userMissions[`${type}_${key}`]) {
    showToast('لقد أنجزت هذه المهمة مسبقاً', 'error');
    return;
  }

  // تحديث المهمة
  await update(ref(db, `users/${uid}/missions`), { [`${type}_${key}`]: true });
  // إضافة المكافأة
  const newBalance = (userData.balance || 0) + mission.reward;
  await updateUser(uid, { balance: newBalance });
  showToast(`🎉 أنجزت "${mission.name}" وحصلت على ${mission.reward} NDOG`, 'success');
  loadMissions(type);
}