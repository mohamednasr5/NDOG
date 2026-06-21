// airdrop.js - الإسقاط الجوي
import { db } from './firebase.js';
import { ref, get, update, push } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { getUserData, updateUser } from './auth.js';
import { showToast } from './ui.js';

let uid = null;

export function initAirdrop(userId) {
  uid = userId;
  loadAirdropTasks();
}

async function loadAirdropTasks() {
  if (!uid) return;
  const container = document.getElementById('airdropTasks');
  if (!container) return;

  const tasksSnap = await get(ref(db, 'airdrops'));
  const tasks = tasksSnap.val() || {};
  const userData = await getUserData(uid);
  const completed = userData?.airdrops || {};

  const html = Object.entries(tasks).map(([key, task]) => {
    const done = completed[key] || false;
    return `
      <div class="task-card glass" style="padding:16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong>${task.name}</strong>
          <p style="font-size:13px;color:#b0c4de;">${task.desc}</p>
          <span style="color:#ffd700;">+${task.reward} NDOG</span>
        </div>
        <button class="btn btn--gold btn--sm airdrop-btn" data-key="${key}" ${done ? 'disabled' : ''}>
          ${done ? '✅ تم' : 'إنجاز'}
        </button>
      </div>
    `;
  }).join('') || '<div class="empty">لا توجد مهام إسقاط جوي حالياً.</div>';
  container.innerHTML = html;

  container.querySelectorAll('.airdrop-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      await completeAirdrop(key);
    });
  });
}

async function completeAirdrop(key) {
  if (!uid) return;
  const taskRef = ref(db, `airdrops/${key}`);
  const snap = await get(taskRef);
  const task = snap.val();
  if (!task) return;

  const userData = await getUserData(uid);
  const completed = userData?.airdrops || {};
  if (completed[key]) {
    showToast('لقد أنجزت هذه المهمة مسبقاً', 'error');
    return;
  }

  // تحديث المهمة
  await update(ref(db, `users/${uid}/airdrops`), { [key]: true });
  // إضافة المكافأة
  const newBalance = (userData.balance || 0) + task.reward;
  await updateUser(uid, { balance: newBalance });
  showToast(`🎉 أنجزت "${task.name}" وحصلت على ${task.reward} NDOG`, 'success');
  loadAirdropTasks();
}