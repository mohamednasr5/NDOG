// NileDogs Admin Panel - admin.js
// Requires: Firebase SDK compat v8 loaded, i18n.js loaded

let adminLang = localStorage.getItem('ndog_lang') || 
  (navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
let adminUser = null;
let editUid = null;

// Apply language on load
document.documentElement.lang = adminLang;
if (adminLang === 'ar') document.documentElement.dir = 'rtl';
if (typeof applyI18n === 'function') applyI18n(adminLang);

// Language pills
document.querySelectorAll('.lang-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    adminLang = btn.dataset.lang;
    localStorage.setItem('ndog_lang', adminLang);
    document.documentElement.lang = adminLang;
    document.documentElement.dir = adminLang === 'ar' ? 'rtl' : 'ltr';
    if (typeof applyI18n === 'function') applyI18n(adminLang);
    // Update active pill
    document.querySelectorAll('.lang-pill').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === adminLang);
    });
  });
  // Set initial active
  btn.classList.toggle('active', btn.dataset.lang === adminLang);
});

// Login
document.getElementById('adminLoginBtn').addEventListener('click', () => {
  auth.signInWithPopup(googleProvider).catch(err => {
    console.error('Admin login error:', err);
  });
});

// Auth check
auth.onAuthStateChanged(user => {
  if (!user) {
    document.getElementById('adminLogin').classList.remove('hidden');
    document.getElementById('adminShell').classList.add('hidden');
    document.getElementById('adminDeny').classList.add('hidden');
    return;
  }
  
  // Check if admin
  db.ref('admins/' + user.uid).once('value').then(snap => {
    if (snap.val() === true) {
      adminUser = user;
      document.getElementById('adminLogin').classList.add('hidden');
      document.getElementById('adminShell').classList.remove('hidden');
      document.getElementById('adminDeny').classList.add('hidden');
      document.getElementById('adminAvatar').src = user.photoURL || '';
      document.getElementById('adminName').textContent = user.displayName || user.email;
      loadOverview();
    } else {
      document.getElementById('adminLogin').classList.add('hidden');
      document.getElementById('adminShell').classList.add('hidden');
      document.getElementById('adminDeny').classList.remove('hidden');
    }
  });
});

// Logout
document.getElementById('adminLogout').addEventListener('click', () => {
  auth.signOut();
});

// Navigation
document.querySelectorAll('.admin-link[data-asec]').forEach(link => {
  link.addEventListener('click', () => {
    const sec = link.dataset.asec;
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.admin-link[data-asec]').forEach(l => l.classList.remove('active'));
    const target = document.getElementById('asec-' + sec);
    if (target) target.classList.add('active');
    link.classList.add('active');
    document.getElementById('adminTitle').textContent = link.querySelector('span').textContent;
    
    // Load section data
    if (sec === 'overview') loadOverview();
    else if (sec === 'users') loadUsers();
    else if (sec === 'referrals') loadReferrals();
    else if (sec === 'claims') loadClaims();
    else if (sec === 'leaderboards') loadAdminLeaderboard();
  });
});

// ===== OVERVIEW =====
function loadOverview() {
  db.ref('users').once('value').then(snap => {
    const users = snap.val() || {};
    const list = Object.values(users);
    const total = list.length;
    const totalBalance = list.reduce((s, u) => s + (u.balance || 0), 0);
    const founders = list.filter(u => u.founder).length;
    const banned = list.filter(u => u.banned).length;
    const avg = total > 0 ? Math.round(totalBalance / total) : 0;
    
    document.getElementById('kpiTotal').textContent = total.toLocaleString();
    document.getElementById('kpiSupply').textContent = totalBalance.toLocaleString();
    document.getElementById('kpiFounders').textContent = founders.toLocaleString();
    document.getElementById('kpiBanned').textContent = banned.toLocaleString();
    document.getElementById('kpiAvg').textContent = avg.toLocaleString();
    
    // Recent users
    const sorted = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const tbody = document.getElementById('recentUsersBody');
    tbody.innerHTML = '';
    sorted.slice(0, 10).forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${u.displayName || '-'}</td><td>${u.email || '-'}</td><td>${u.country || '-'}</td><td>${(u.balance||0).toLocaleString()}</td><td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}</td>`;
      tbody.appendChild(tr);
    });
  });
  
  // Claims today
  const today = new Date();
  today.setHours(0,0,0,0);
  db.ref('claims').orderByChild('ts').startAt(today.getTime()).once('value').then(snap => {
    const claims = snap.val() || {};
    document.getElementById('kpiClaims').textContent = Object.keys(claims).length;
  });
  
  document.getElementById('kpiActive').textContent = '—';
  document.getElementById('kpiRefs').textContent = '—';
}

// ===== USERS =====
function loadUsers() {
  db.ref('users').once('value').then(snap => {
    const users = snap.val() || {};
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = '';
    
    Object.entries(users).forEach(([uid, u]) => {
      const tr = document.createElement('tr');
      const status = u.banned ? '<span class="pill pill--ban">Banned</span>' : '<span class="pill pill--ok">Active</span>';
      const founderBadge = u.founder ? '<span class="pill pill--founder">Founder</span>' : '';
      tr.innerHTML = `
        <td>${u.displayName||'-'} ${founderBadge}</td>
        <td>${u.email||'-'}</td>
        <td>${u.referralCode||'-'}</td>
        <td>${u.country||'-'}</td>
        <td>${(u.balance||0).toLocaleString()}</td>
        <td>-</td>
        <td>${status}</td>
        <td class="row-actions">
          <button class="gold" onclick="editUser('${uid}','${(u.displayName||'').replace(/'/g,"\\'")}','${u.balance||0}','${u.country||''}')">Edit</button>
          <button class="danger" onclick="banUser('${uid}',${!u.banned})">${u.banned ? 'Unban' : 'Ban'}</button>
        </td>`;
      tbody.appendChild(tr);
    });
  });
}

function editUser(uid, name, balance, country) {
  editUid = uid;
  document.getElementById('editName').value = name;
  document.getElementById('editBalance').value = balance;
  document.getElementById('editCountry').value = country;
  document.getElementById('editModal').classList.remove('hidden');
}

function banUser(uid, ban) {
  if (!confirm(ban ? 'Ban this user?' : 'Unban this user?')) return;
  db.ref('users/' + uid + '/banned').set(ban).then(() => {
    db.ref(ban ? 'bannedUsers/' + uid : 'bannedUsers/' + uid).set(ban ? true : null);
    loadUsers();
  });
}

// Modal close
document.querySelectorAll('[data-close-modal]').forEach(el => {
  el.addEventListener('click', () => {
    document.getElementById('editModal').classList.add('hidden');
  });
});

// Save edit
document.getElementById('saveEditBtn').addEventListener('click', () => {
  if (!editUid) return;
  const updates = {};
  const name = document.getElementById('editName').value.trim();
  const balance = parseInt(document.getElementById('editBalance').value) || 0;
  const country = document.getElementById('editCountry').value.trim();
  if (name) updates['users/' + editUid + '/displayName'] = name;
  if (country) updates['users/' + editUid + '/country'] = country;
  
  db.ref().update(updates).then(() => {
    document.getElementById('editModal').classList.add('hidden');
    loadUsers();
  });
});

// ===== REFERRALS =====
function loadReferrals() {
  db.ref('referrals').once('value').then(snap => {
    const refs = snap.val() || {};
    const tbody = document.getElementById('referralsBody');
    tbody.innerHTML = '';
    
    Object.entries(refs).forEach(([uid, userRefs]) => {
      Object.entries(userRefs).forEach(([referredUid, ref]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${uid.substring(0,8)}...</td><td>${ref.uid.substring(0,8)}...</td><td>L${ref.level}</td><td>${new Date(ref.ts).toLocaleDateString()}</td>`;
        tbody.appendChild(tr);
      });
    });
  });
}

// ===== CLAIMS =====
function loadClaims() {
  db.ref('claims').orderByChild('ts').limitToLast(50).once('value').then(snap => {
    const claims = snap.val() || {};
    const tbody = document.getElementById('claimsBody');
    tbody.innerHTML = '';
    
    Object.values(claims).reverse().forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${(c.uid||'').substring(0,12)}...</td><td>${c.type||'daily'}</td><td>${c.amount||0}</td><td>${new Date(c.ts).toLocaleDateString()}</td>`;
      tbody.appendChild(tr);
    });
  });
}

// ===== LEADERBOARD =====
function loadAdminLeaderboard() {
  db.ref('users').orderByChild('balance').limitToLast(50).once('value').then(snap => {
    const users = snap.val() || {};
    const sorted = Object.values(users).sort((a, b) => (b.balance || 0) - (a.balance || 0));
    const tbody = document.getElementById('adminLbBody');
    tbody.innerHTML = '';
    
    sorted.forEach((u, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i+1}</td><td>${u.displayName||'-'}</td><td>${u.country||'-'}</td><td>${(u.balance||0).toLocaleString()}</td><td>-</td>`;
      tbody.appendChild(tr);
    });
  });
}

// ===== GIFTS =====
document.getElementById('sendGiftBtn').addEventListener('click', () => {
  const target = document.getElementById('giftTarget').value.trim();
  const amount = parseInt(document.getElementById('giftAmount').value) || 0;
  const reason = document.getElementById('giftReason').value.trim();
  
  if (amount <= 0 || amount > 10000) { alert('Invalid amount (1-10000)'); return; }
  
  if (!target) {
    // Broadcast to all
    db.ref('users').once('value').then(snap => {
      const users = snap.val() || {};
      const updates = {};
      Object.entries(users).forEach(([uid, u]) => {
        updates['users/' + uid + '/balance'] = firebase.database.ServerValue.TIMESTAMP; // placeholder
      });
      // Simple approach: iterate and add
      Object.keys(users).forEach(uid => {
        db.ref('users/' + uid + '/balance').transaction(bal => (bal || 0) + amount);
      });
      alert('Gift sent to all users: +' + amount + ' NDOG');
    });
  }
});

// ===== TASKS =====
document.getElementById('createTaskBtn').addEventListener('click', () => {
  const title = document.getElementById('taskTitle').value.trim();
  const desc = document.getElementById('taskDesc').value.trim();
  const type = document.getElementById('taskType').value;
  const reward = parseInt(document.getElementById('taskReward').value) || 0;
  
  if (!title) { alert('Title required'); return; }
  
  db.ref('missions/' + type).push({
    title_ar: title, title_en: title,
    description_ar: desc, description_en: desc,
    reward: reward, type: type, active: true,
    autoComplete: true
  }).then(() => {
    alert('Task created!');
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDesc').value = '';
    document.getElementById('taskReward').value = '';
  });
});

// ===== NOTIFICATIONS =====
document.getElementById('sendNotifBtn').addEventListener('click', () => {
  const title = document.getElementById('notifTitle').value.trim();
  const message = document.getElementById('notifMessage').value.trim();
  
  if (!title || !message) { alert('Title and message required'); return; }
  
  db.ref('users').once('value').then(snap => {
    const users = snap.val() || {};
    const now = Date.now();
    Object.keys(users).forEach(uid => {
      db.ref('notifications/' + uid).push({
        title: title, message: message, ts: now, read: false
      });
    });
    alert('Notification sent to all users');
  });
});

// ===== EVENTS =====
document.getElementById('createEventBtn').addEventListener('click', () => {
  const title = document.getElementById('eventTitle').value.trim();
  const desc = document.getElementById('eventDesc').value.trim();
  const reward = parseInt(document.getElementById('eventReward').value) || 0;
  const status = document.getElementById('eventStatus').value.toLowerCase();
  
  if (!title) { alert('Title required'); return; }
  
  db.ref('news').push({
    title_ar: title, title_en: title,
    content_ar: desc, content_en: desc,
    reward: reward, status: status,
    category: 'event', publishedAt: Date.now(),
    author: 'Admin'
  }).then(() => {
    alert('Event created!');
  });
});

// ===== EXPORT =====
function exportCSV(filename, data, headers) {
  let csv = headers.join(',') + '\n';
  data.forEach(row => {
    csv += row.map(v => `"${(v||'').toString().replace(/"/g, '""')}"`).join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('exportUsersBtn').addEventListener('click', () => {
  db.ref('users').once('value').then(snap => {
    const users = snap.val() || {};
    const data = Object.values(users).map(u => [u.displayName, u.email, u.country, u.balance, u.referralCode, u.founder, u.createdAt]);
    exportCSV('ndog-users.csv', data, ['Name', 'Email', 'Country', 'Balance', 'ReferralCode', 'Founder', 'CreatedAt']);
  });
});

document.getElementById('exportClaimsBtn').addEventListener('click', () => {
  db.ref('claims').limitToLast(1000).once('value').then(snap => {
    const claims = snap.val() || {};
    const data = Object.values(claims).map(c => [c.uid, c.amount, c.ts]);
    exportCSV('ndog-claims.csv', data, ['UID', 'Amount', 'Timestamp']);
  });
});

document.getElementById('exportReferralsBtn').addEventListener('click', () => {
  db.ref('referrals').once('value').then(snap => {
    const refs = snap.val() || {};
    const data = [];
    Object.entries(refs).forEach(([uid, userRefs]) => {
      Object.entries(userRefs).forEach(([refUid, ref]) => {
        data.push([uid, ref.uid, ref.level, ref.bonus, ref.ts]);
      });
    });
    exportCSV('ndog-referrals.csv', data, ['ReferrerUID', 'ReferredUID', 'Level', 'Bonus', 'Timestamp']);
  });
});
