/**
 * NileDogs (NDOG) — Admin Dashboard
 * ------------------------------------------------------------------
 * Access control: only UIDs listed in APP_CONFIG.adminUIDs OR
 *                 present in the `admins` Realtime DB node.
 * Features: users, referrals, claims, tasks, notifications, events,
 *           leaderboards, analytics, CSV export.
 */

import {
  auth, db, googleProvider, APP_CONFIG,
  ref, get, set, update, push, remove, onValue,
  signInWithPopup, signOut, onAuthStateChanged
} from "./firebase-config.js";

let currentUser = null;
let allUsers = [];
let allClaims = [];
let allReferrals = [];
let editingUid = null;

// ───────────────────────────────────────────────────────────────────
// AUTH GATE
// ───────────────────────────────────────────────────────────────────
document.getElementById("adminLoginBtn")?.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    toast(err.message || "Login failed", "err");
  }
});

document.getElementById("adminLogout")?.addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});

onAuthStateChanged(auth, async (fbUser) => {
  if (!fbUser) {
    show("adminLogin");
    return;
  }
  // Check admin list
  let isAdmin = APP_CONFIG.adminUIDs.includes(fbUser.uid);
  if (!isAdmin) {
    const adminSnap = await get(ref(db, `admins/${fbUser.uid}`));
    isAdmin = adminSnap.exists();
  }
  if (!isAdmin) {
    show("adminDeny");
    return;
  }
  // Logged in as admin
  show("adminShell");
  document.getElementById("adminAvatar").src = fbUser.photoURL || "";
  document.getElementById("adminName").textContent = fbUser.displayName || "Admin";
  bootstrapAdmin();
});

function show(id) {
  ["adminLogin", "adminDeny", "adminShell"].forEach(el => {
    document.getElementById(el)?.classList.add("hidden");
  });
  document.getElementById(id)?.classList.remove("hidden");
}

// ───────────────────────────────────────────────────────────────────
// TOAST
// ───────────────────────────────────────────────────────────────────
function toast(msg, type = "info", duration = 2800) {
  const host = document.getElementById("toastHost");
  if (!host) return;
  const t = document.createElement("div");
  t.className = `toast toast--${type}`;
  t.innerHTML = `<span>${msg}</span>`;
  host.appendChild(t);
  setTimeout(() => t.remove(), duration + 400);
}

// ───────────────────────────────────────────────────────────────────
// SECTION NAVIGATION
// ───────────────────────────────────────────────────────────────────
document.querySelectorAll("[data-asec]").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelectorAll("[data-asec]").forEach(l => l.classList.remove("active"));
    link.classList.add("active");
    document.querySelectorAll(".admin-section").forEach(s => s.classList.remove("active"));
    document.getElementById(`asec-${link.dataset.asec}`).classList.add("active");
    document.getElementById("adminTitle").textContent = link.textContent.trim().replace(/^[^\s]+\s/, "");
    renderSection(link.dataset.asec);
  });
});

function renderSection(sec) {
  switch (sec) {
    case "overview":     renderOverview(); break;
    case "users":        renderUsers(); break;
    case "referrals":    renderReferrals(); break;
    case "claims":       renderClaims(); break;
    case "tasks":        renderTasks(); break;
    case "notifications":renderNotifications(); break;
    case "events":       renderEvents(); break;
    case "leaderboards": renderAdminLb(); break;
    case "analytics":    renderAnalytics(); break;
  }
}

// ───────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ───────────────────────────────────────────────────────────────────
async function bootstrapAdmin() {
  await loadAll();
  renderOverview();

  // Wire buttons
  document.getElementById("refreshUsers")?.addEventListener("click", loadAll);
  document.getElementById("userSearch")?.addEventListener("input", renderUsers);
  document.getElementById("userFilter")?.addEventListener("change", renderUsers);
  document.getElementById("createTaskBtn")?.addEventListener("click", createTask);
  document.getElementById("sendNotifBtn")?.addEventListener("click", sendNotif);
  document.getElementById("createEventBtn")?.addEventListener("click", createEvent);
  document.getElementById("saveEditBtn")?.addEventListener("click", saveEdit);
  document.getElementById("exportUsersBtn")?.addEventListener("click", () => exportCSV("users"));
  document.getElementById("exportClaimsBtn")?.addEventListener("click", () => exportCSV("claims"));
  document.getElementById("exportReferralsBtn")?.addEventListener("click", () => exportCSV("referrals"));
}

async function loadAll() {
  const [usersSnap, claimsSnap, refSnap] = await Promise.all([
    get(ref(db, "users")),
    get(ref(db, "claims")),
    get(ref(db, "referrals"))
  ]);
  allUsers = [];
  if (usersSnap.exists()) usersSnap.forEach(c => allUsers.push(c.val()));
  allClaims = [];
  if (claimsSnap.exists()) claimsSnap.forEach(c => allClaims.push(c.val()));
  allReferrals = [];
  if (refSnap.exists()) refSnap.forEach(c => allReferrals.push(c.val()));
  renderSection(document.querySelector(".admin-link.active")?.dataset.asec);
}

// ───────────────────────────────────────────────────────────────────
// OVERVIEW
// ───────────────────────────────────────────────────────────────────
function renderOverview() {
  const total    = allUsers.length;
  const now      = Date.now();
  const dayAgo   = now - 24 * 3600 * 1000;
  const active   = allUsers.filter(u => (u.lastClaim || 0) > dayAgo).length;
  const claimsT  = allClaims.filter(c => (c.date || 0) > dayAgo).length;
  const supply   = allUsers.reduce((s, u) => s + (u.balance || 0), 0);
  const refs     = allReferrals.length;
  const founders = allUsers.filter(u => u.isFounder).length;
  const banned   = allUsers.filter(u => u.banned).length;
  const avg      = total ? Math.round(supply / total) : 0;

  setText("kpiTotal", total);
  setText("kpiActive", active);
  setText("kpiClaims", claimsT);
  setText("kpiSupply", supply.toLocaleString());
  setText("kpiRefs", refs);
  setText("kpiFounders", founders);
  setText("kpiBanned", banned);
  setText("kpiAvg", avg.toLocaleString());

  // recent users
  const recent = [...allUsers].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 8);
  const body = document.getElementById("recentUsersBody");
  if (body) body.innerHTML = recent.map(u => `
    <tr>
      <td>${escapeHtml(u.name || "—")}</td>
      <td>${escapeHtml(u.email || "—")}</td>
      <td>${u.country || "—"}</td>
      <td>${(u.balance || 0).toLocaleString()}</td>
      <td>${formatDate(u.createdAt)}</td>
    </tr>`).join("");
}

// ───────────────────────────────────────────────────────────────────
// USERS
// ───────────────────────────────────────────────────────────────────
function renderUsers() {
  const q = (document.getElementById("userSearch")?.value || "").toLowerCase();
  const filter = document.getElementById("userFilter")?.value || "";
  const dayAgo = Date.now() - 24 * 3600 * 1000;

  let list = allUsers.filter(u => {
    const matches = (u.name || "").toLowerCase().includes(q) ||
                    (u.email || "").toLowerCase().includes(q) ||
                    (u.referralCode || "").toLowerCase().includes(q) ||
                    (u.country || "").toLowerCase().includes(q);
    if (!matches) return false;
    if (filter === "founder") return !!u.isFounder;
    if (filter === "banned")  return !!u.banned;
    if (filter === "active")  return (u.lastClaim || 0) > dayAgo;
    return true;
  });

  const body = document.getElementById("usersBody");
  if (!body) return;
  body.innerHTML = list.slice(0, 200).map(u => `
    <tr>
      <td>${escapeHtml(u.name || "—")}</td>
      <td>${escapeHtml(u.email || "—")}</td>
      <td><code>${u.referralCode || "—"}</code></td>
      <td>${u.country || "—"}</td>
      <td>${(u.balance || 0).toLocaleString()}</td>
      <td>${u.totalReferrals || 0}</td>
      <td>
        ${u.banned ? '<span class="pill pill--ban">Banned</span>' : '<span class="pill pill--ok">Active</span>'}
        ${u.isFounder ? '<span class="pill pill--founder">Founder</span>' : ''}
      </td>
      <td class="row-actions">
        <button class="gold"   data-edit="${u.uid}">Edit</button>
        <button data-add="${u.uid}">+Rwd</button>
        <button data-sub="${u.uid}">−Rwd</button>
        <button class="${u.banned ? "" : "danger"}" data-ban="${u.uid}">${u.banned ? "Unban" : "Ban"}</button>
        <button class="danger" data-del="${u.uid}">Del</button>
      </td>
    </tr>`).join("");

  body.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openEdit(b.dataset.edit)));
  body.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => adjustBalance(b.dataset.add,  +50)));
  body.querySelectorAll("[data-sub]").forEach(b => b.addEventListener("click", () => adjustBalance(b.dataset.sub,  -50)));
  body.querySelectorAll("[data-ban]").forEach(b => b.addEventListener("click", () => toggleBan(b.dataset.ban)));
  body.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => deleteUser(b.dataset.del)));
}

function openEdit(uid) {
  const u = allUsers.find(x => x.uid === uid);
  if (!u) return;
  editingUid = uid;
  document.getElementById("editName").value    = u.name || "";
  document.getElementById("editBalance").value = u.balance || 0;
  document.getElementById("editCountry").value = u.country || "";
  document.getElementById("editScore").value   = u.communityScore || 0;
  document.getElementById("editModal").classList.remove("hidden");
}

async function saveEdit() {
  if (!editingUid) return;
  await update(ref(db, `users/${editingUid}`), {
    name:           document.getElementById("editName").value,
    balance:        +document.getElementById("editBalance").value,
    country:        document.getElementById("editCountry").value,
    communityScore: +document.getElementById("editScore").value
  });
  toast("User updated", "ok");
  document.getElementById("editModal").classList.add("hidden");
  await loadAll();
}

async function adjustBalance(uid, delta) {
  const u = allUsers.find(x => x.uid === uid);
  if (!u) return;
  await update(ref(db, `users/${uid}`), { balance: Math.max(0, (u.balance || 0) + delta) });
  toast(`${delta > 0 ? "+" : ""}${delta} NDOG applied`, "ok");
  await loadAll();
}

async function toggleBan(uid) {
  const u = allUsers.find(x => x.uid === uid);
  if (!u) return;
  await update(ref(db, `users/${uid}`), { banned: !u.banned });
  toast(u.banned ? "User unbanned" : "User banned", "ok");
  await loadAll();
}

async function deleteUser(uid) {
  if (!confirm("Permanently delete this user? This cannot be undone.")) return;
  await remove(ref(db, `users/${uid}`));
  toast("User deleted", "ok");
  await loadAll();
}

// ───────────────────────────────────────────────────────────────────
// REFERRALS
// ───────────────────────────────────────────────────────────────────
function renderReferrals() {
  const body = document.getElementById("referralsBody");
  if (!body) return;
  const usersMap = {};
  allUsers.forEach(u => usersMap[u.uid] = u);
  body.innerHTML = allReferrals.slice(0, 200).map(r => `
    <tr>
      <td>${escapeHtml(usersMap[r.referrer]?.name || r.referrer)}</td>
      <td>${escapeHtml(usersMap[r.referredUser]?.name || r.referredUser)}</td>
      <td><span class="pill pill--founder">L${r.level || 1}</span></td>
      <td>${formatDate(r.createdAt)}</td>
    </tr>`).join("");
}

// ───────────────────────────────────────────────────────────────────
// CLAIMS
// ───────────────────────────────────────────────────────────────────
function renderClaims() {
  const body = document.getElementById("claimsBody");
  if (!body) return;
  const recent = [...allClaims].sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 200);
  body.innerHTML = recent.map(c => `
    <tr>
      <td><code>${c.userId?.slice(0, 10)}…</code></td>
      <td>${c.type || "daily"}</td>
      <td>+${c.amount || 0}</td>
      <td>${formatDate(c.date)}</td>
    </tr>`).join("");
}

// ───────────────────────────────────────────────────────────────────
// TASKS
// ───────────────────────────────────────────────────────────────────
async function createTask() {
  const title  = document.getElementById("taskTitle").value.trim();
  const desc   = document.getElementById("taskDesc").value.trim();
  const type   = document.getElementById("taskType").value;
  const reward = +document.getElementById("taskReward").value;
  if (!title || !reward) return toast("Title and reward required", "err");
  await push(ref(db, "tasks"), {
    title, desc, type, reward,
    status: "active",
    createdAt: Date.now()
  });
  toast("Task created", "ok");
  document.getElementById("taskTitle").value = "";
  document.getElementById("taskDesc").value = "";
  document.getElementById("taskReward").value = "";
  renderTasks();
}

async function renderTasks() {
  const snap = await get(ref(db, "tasks"));
  const body = document.getElementById("tasksBody");
  if (!body) return;
  if (!snap.exists()) { body.innerHTML = `<tr><td colspan="5" class="empty">No tasks yet.</td></tr>`; return; }
  const tasks = [];
  snap.forEach(c => tasks.push({ id: c.key, ...c.val() }));
  body.innerHTML = tasks.map(t => `
    <tr>
      <td>${escapeHtml(t.title)}</td>
      <td>${t.type}</td>
      <td>+${t.reward}</td>
      <td><span class="pill pill--ok">${t.status}</span></td>
      <td class="row-actions"><button class="danger" data-deltask="${t.id}">Delete</button></td>
    </tr>`).join("");
  body.querySelectorAll("[data-deltask]").forEach(b =>
    b.addEventListener("click", async () => {
      await remove(ref(db, `tasks/${b.dataset.deltask}`));
      toast("Task deleted", "ok");
      renderTasks();
    })
  );
}

// ───────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ───────────────────────────────────────────────────────────────────
async function sendNotif() {
  const title   = document.getElementById("notifTitle").value.trim();
  const message = document.getElementById("notifMessage").value.trim();
  if (!title || !message) return toast("Title and message required", "err");
  await push(ref(db, "notifications"), { title, message, createdAt: Date.now() });
  toast("Notification sent to all users", "ok");
  document.getElementById("notifTitle").value = "";
  document.getElementById("notifMessage").value = "";
  renderNotifications();
}

async function renderNotifications() {
  const snap = await get(ref(db, "notifications"));
  const body = document.getElementById("notifsBody");
  if (!body) return;
  if (!snap.exists()) { body.innerHTML = `<tr><td colspan="3" class="empty">No notifications yet.</td></tr>`; return; }
  const notifs = [];
  snap.forEach(c => notifs.push(c.val()));
  notifs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  body.innerHTML = notifs.slice(0, 20).map(n => `
    <tr>
      <td><strong>${escapeHtml(n.title)}</strong></td>
      <td>${escapeHtml(n.message)}</td>
      <td>${formatDate(n.createdAt)}</td>
    </tr>`).join("");
}

// ───────────────────────────────────────────────────────────────────
// EVENTS
// ───────────────────────────────────────────────────────────────────
async function createEvent() {
  const title  = document.getElementById("eventTitle").value.trim();
  const desc   = document.getElementById("eventDesc").value.trim();
  const reward = +document.getElementById("eventReward").value;
  const status = document.getElementById("eventStatus").value;
  if (!title) return toast("Title required", "err");
  await push(ref(db, "events"), { title, desc, reward, status, createdAt: Date.now() });
  toast("Event created", "ok");
  document.getElementById("eventTitle").value = "";
  document.getElementById("eventDesc").value = "";
  document.getElementById("eventReward").value = "";
  renderEvents();
}

async function renderEvents() {
  const snap = await get(ref(db, "events"));
  const body = document.getElementById("eventsBody");
  if (!body) return;
  if (!snap.exists()) { body.innerHTML = `<tr><td colspan="4" class="empty">No events yet.</td></tr>`; return; }
  const events = [];
  snap.forEach(c => events.push({ id: c.key, ...c.val() }));
  body.innerHTML = events.map(e => `
    <tr>
      <td>${escapeHtml(e.title)}</td>
      <td>+${e.reward || 0}</td>
      <td><span class="pill pill--ok">${e.status}</span></td>
      <td class="row-actions"><button class="danger" data-delev="${e.id}">Delete</button></td>
    </tr>`).join("");
  body.querySelectorAll("[data-delev]").forEach(b =>
    b.addEventListener("click", async () => {
      await remove(ref(db, `events/${b.dataset.delev}`));
      toast("Event deleted", "ok");
      renderEvents();
    })
  );
}

// ───────────────────────────────────────────────────────────────────
// ADMIN LEADERBOARD
// ───────────────────────────────────────────────────────────────────
function renderAdminLb() {
  const body = document.getElementById("adminLbBody");
  if (!body) return;
  const top = [...allUsers].sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 50);
  body.innerHTML = top.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(u.name || "—")}</td>
      <td>${u.country || "—"}</td>
      <td>${(u.balance || 0).toLocaleString()}</td>
      <td>${u.totalReferrals || 0}</td>
    </tr>`).join("");
}

// ───────────────────────────────────────────────────────────────────
// ANALYTICS
// ───────────────────────────────────────────────────────────────────
function renderAnalytics() {
  const now = Date.now();
  const dayAgo = now - 24 * 3600 * 1000;
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 3600 * 1000;

  const dau = allUsers.filter(u => (u.lastClaim || 0) > dayAgo).length;
  const retained = allUsers.filter(u => (u.createdAt || 0) < weekAgo && (u.lastClaim || 0) > dayAgo).length;
  const eligible = allUsers.filter(u => (u.createdAt || 0) < weekAgo).length;
  const ret7 = eligible ? Math.round((retained / eligible) * 100) : 0;

  const refsThisWeek = allReferrals.filter(r => (r.createdAt || 0) > weekAgo).length;
  const refsLastWeek = allReferrals.filter(r => (r.createdAt || 0) > twoWeeksAgo && (r.createdAt || 0) < weekAgo).length;
  const refGrowth = refsLastWeek ? Math.round(((refsThisWeek - refsLastWeek) / refsLastWeek) * 100) : 0;

  const todayClaims = allClaims.filter(c => (c.date || 0) > dayAgo);
  const avgClaim = todayClaims.length
    ? Math.round(todayClaims.reduce((s, c) => s + (c.amount || 0), 0) / todayClaims.length)
    : 0;

  setText("aDau", dau);
  setText("aRet7", ret7 + "%");
  setText("aRefGrowth", (refGrowth >= 0 ? "+" : "") + refGrowth + "%");
  setText("aAvgClaim", avgClaim);

  // Bar chart: claims per day, last 14 days
  const chart = document.getElementById("claimsChart");
  if (chart) {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const start = now - i * 86400000;
      const dayStart = new Date(start).setHours(0,0,0,0);
      const dayEnd = dayStart + 86400000;
      const count = allClaims.filter(c => (c.date || 0) >= dayStart && (c.date || 0) < dayEnd).length;
      days.push(count);
    }
    const max = Math.max(1, ...days);
    chart.innerHTML = days.map((v, i) => `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px">
        <div style="width:100%;max-width:40px;background:linear-gradient(180deg,var(--gold),var(--nile));border-radius:6px 6px 0 0;height:${(v / max) * 100}%;min-height:4px;box-shadow:0 0 8px rgba(255,215,0,0.3)"></div>
        <small style="font-size:9px;color:var(--text-mute)">${13 - i}d</small>
      </div>`).join("");
  }
}

// ───────────────────────────────────────────────────────────────────
// EXPORT CSV
// ───────────────────────────────────────────────────────────────────
function exportCSV(type) {
  let csv = "";
  let filename = "";
  if (type === "users") {
    filename = "ndog_users.csv";
    csv = "uid,name,email,country,balance,referralCode,totalReferrals,communityScore,loyaltyScore,isFounder,banned,createdAt\n";
    allUsers.forEach(u => {
      csv += [
        u.uid, u.name, u.email, u.country, u.balance, u.referralCode,
        u.totalReferrals, u.communityScore, u.loyaltyScore, u.isFounder, u.banned, u.createdAt
      ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",") + "\n";
    });
  } else if (type === "claims") {
    filename = "ndog_claims.csv";
    csv = "userId,amount,type,date\n";
    allClaims.forEach(c => {
      csv += [c.userId, c.amount, c.type, c.date].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",") + "\n";
    });
  } else if (type === "referrals") {
    filename = "ndog_referrals.csv";
    csv = "referrer,referredUser,level,createdAt\n";
    allReferrals.forEach(r => {
      csv += [r.referrer, r.referredUser, r.level, r.createdAt].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",") + "\n";
    });
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast("Export ready", "ok");
}

// ───────────────────────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Init particles for admin page too
function initParticles() {
  const canvas = document.getElementById("particles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w, h, particles = [];
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    const count = Math.min(40, Math.floor(w * h / 28000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.4 + 0.3,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      hue: Math.random() < 0.5 ? 205 : 48
    }));
  }
  function draw() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},90%,65%,0.6)`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  resize();
  window.addEventListener("resize", resize);
  draw();
}
initParticles();
