/**
 * FILE NAME: js/admin.js
 * PURPOSE: Admin panel controller. Role-gated. User/balance/ban/referral/mission/
 *          news/fraud/analytics management. Audit log for every admin action.
 * DEPENDENCIES: firebase.js, auth.js, database.js, antifraud.js, utils.js
 * EXPORTS: admin.init, admin.tabs
 */

import { firebaseDb } from "./firebase.js";
import { auth } from "./auth.js";
import { db, PATHS } from "./database.js";
import { antifraud } from "./antifraud.js";
import { $, $$, safeHTML, showToast, formatNDOG, formatNumber, formatDate, downloadCSV, timeAgo } from "./utils.js";
import { ref, get, query, orderByChild, limitToLast, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const TABS = ["overview", "users", "balance", "bans", "missions", "news", "fraud", "analytics"];

export const admin = {
  init() {
    auth.onReady((user) => {
      if (!user) {
        location.href = "/";
        return;
      }
      if (!auth.isAdmin()) {
        $("#admin-root").innerHTML = `
          <div class="card card--denied">
            <h2>🚫 Access Denied</h2>
            <p>Admin privileges required.</p>
            <a href="/" class="btn btn--primary">Back to Home</a>
          </div>`;
        return;
      }
      this._renderShell();
      this._loadOverview();
    });
  },

  _renderShell() {
    $("#admin-root").innerHTML = `
      <aside class="admin-sidebar">
        ${TABS.map((t) => `<button class="admin-nav-btn ${t === "overview" ? "active" : ""}" data-tab="${t}">${this._tabIcon(t)} ${t.charAt(0).toUpperCase() + t.slice(1)}</button>`).join("")}
      </aside>
      <main class="admin-main" id="admin-main"></main>
    `;
    $$(".admin-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".admin-nav-btn").forEach((b) => b.classList.toggle("active", b === btn));
        this._switchTab(btn.dataset.tab);
      });
    });
  },

  _tabIcon(t) {
    return { overview: "📊", users: "👥", balance: "💰", bans: "🚫", missions: "🎯", news: "📰", fraud: "🛡️", analytics: "📈" }[t] || "•";
  },

  _switchTab(tab) {
    const fn = this[`_load${tab.charAt(0).toUpperCase() + tab.slice(1)}`];
    if (fn) fn.call(this);
  },

  /* ============ Overview ============ */
  async _loadOverview() {
    const main = $("#admin-main");
    main.innerHTML = '<div class="muted">Loading…</div>';

    const [usersSnap, fraudSnap, newsSnap, missionsSnap, contractsSnap] = await Promise.all([
      get(ref(firebaseDb, PATHS.users)),
      get(ref(firebaseDb, PATHS.fraudLogs)),
      get(ref(firebaseDb, PATHS.news)),
      get(ref(firebaseDb, PATHS.missions)),
      get(ref(firebaseDb, PATHS.stakingContracts))
    ]);

    const users = usersSnap.val() || {};
    const userCount = Object.keys(users).length;
    const totalSupply = Object.values(users).reduce((s, u) => s + (u.balance || 0), 0);
    const bannedCount = Object.values(users).filter((u) => u.banned).length;
    const fraudCount = Object.keys(fraudSnap.val() || {}).length;

    main.innerHTML = `
      <h2>📊 Overview</h2>
      <div class="admin-cards">
        <div class="card"><div class="card__label">Total Users</div><div class="card__value">${formatNumber(userCount)}</div></div>
        <div class="card"><div class="card__label">Banned Users</div><div class="card__value">${formatNumber(bannedCount)}</div></div>
        <div class="card"><div class="card__label">Circulating NDOG</div><div class="card__value">${formatNDOG(totalSupply)}</div></div>
        <div class="card"><div class="card__label">Fraud Alerts</div><div class="card__value">${formatNumber(fraudCount)}</div></div>
        <div class="card"><div class="card__label">News Posts</div><div class="card__value">${formatNumber(Object.keys(newsSnap.val() || {}).length)}</div></div>
        <div class="card"><div class="card__label">Active Missions</div><div class="card__value">${formatNumber(Object.keys(missionsSnap.val() || {}).length)}</div></div>
        <div class="card"><div class="card__label">Staking Contracts</div><div class="card__value">${formatNumber(Object.keys(contractsSnap.val() || {}).length)}</div></div>
      </div>
      <div class="card">
        <h3>Quick Actions</h3>
        <div class="admin-quick">
          <button class="btn btn--ghost" data-quick="users">Manage Users</button>
          <button class="btn btn--ghost" data-quick="news">Post News</button>
          <button class="btn btn--ghost" data-quick="fraud">Review Fraud</button>
          <button class="btn btn--ghost" data-quick="analytics">View Analytics</button>
        </div>
      </div>
    `;
    $$("[data-quick]").forEach((b) => b.addEventListener("click", () => this._switchTab(b.dataset.quick)));
  },

  /* ============ Users ============ */
  async _loadUsers() {
    const main = $("#admin-main");
    main.innerHTML = `
      <h2>👥 User Management</h2>
      <div class="admin-toolbar">
        <input type="search" id="user-search" placeholder="Search by email, name, uid…" />
        <button class="btn btn--ghost" id="user-export">Export CSV</button>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>UID</th><th>Name</th><th>Email</th><th>Balance</th><th>Role</th><th>Banned</th><th>Actions</th></tr></thead>
          <tbody id="user-tbody"><tr><td colspan="7" class="muted">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
    const snap = await get(ref(firebaseDb, PATHS.users));
    const users = snap.val() || {};
    this._renderUsers(users);

    $("#user-search").addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = {};
      for (const [k, v] of Object.entries(users)) {
        if (
          (v.displayName || "").toLowerCase().includes(q) ||
          (v.email || "").toLowerCase().includes(q) ||
          k.toLowerCase().includes(q)
        ) {
          filtered[k] = v;
        }
      }
      this._renderUsers(filtered);
    });

    $("#user-export").addEventListener("click", () => {
      const rows = [["UID", "Name", "Email", "Balance", "Role", "Country", "Banned"]];
      for (const [k, v] of Object.entries(users)) {
        rows.push([k, v.displayName, v.email, v.balance, v.role, v.country, v.banned ? "YES" : "NO"]);
      }
      downloadCSV("ndog-users.csv", rows);
    });
  },

  _renderUsers(users) {
    const body = $("#user-tbody");
    const entries = Object.entries(users);
    if (entries.length === 0) {
      body.innerHTML = '<tr><td colspan="7" class="muted">No users found.</td></tr>';
      return;
    }
    body.innerHTML = entries
      .slice(0, 200)
      .map(
        ([uid, u]) => `
      <tr>
        <td><code>${uid.slice(0, 8)}…</code></td>
        <td>${safeHTML(u.displayName || "—")}</td>
        <td>${safeHTML(u.email || "—")}</td>
        <td>${formatNDOG(u.balance || 0)}</td>
        <td><span class="badge badge--${u.role || "user"}">${u.role || "user"}</span></td>
        <td>${u.banned ? "🚫" : "✓"}</td>
        <td>
          <button class="btn btn--sm btn--ghost" data-promote="${uid}" data-role="admin">Make Admin</button>
          <button class="btn btn--sm btn--ghost" data-promote="${uid}" data-role="mod">Mod</button>
          <button class="btn btn--sm btn--ghost" data-promote="${uid}" data-role="user">User</button>
          <button class="btn btn--sm ${u.banned ? "btn--primary" : "btn--danger"}" data-ban="${uid}" data-banned="${u.banned ? "1" : "0"}">${u.banned ? "Unban" : "Ban"}</button>
        </td>
      </tr>`
      )
      .join("");
    $$("[data-promote]").forEach((b) =>
      b.addEventListener("click", async () => {
        await db.users.setRole(b.dataset.promote, b.dataset.role);
        await this._audit("set_role", { uid: b.dataset.promote, role: b.dataset.role });
        showToast(`Role updated to ${b.dataset.role}`, "success");
        this._loadUsers();
      })
    );
    $$("[data-ban]").forEach((b) =>
      b.addEventListener("click", async () => {
        const uid = b.dataset.ban;
        const banned = b.dataset.banned === "1";
        if (banned) {
          await db.users.unban(uid);
          await this._audit("unban", { uid });
          showToast("User unbanned.", "success");
        } else {
          const reason = prompt("Ban reason?");
          if (!reason) return;
          await db.users.ban(uid, reason, auth.currentUser().uid);
          await this._audit("ban", { uid, reason });
          showToast("User banned.", "success");
        }
        this._loadUsers();
      })
    );
  },

  /* ============ Balance Management ============ */
  async _loadBalance() {
    const main = $("#admin-main");
    main.innerHTML = `
      <h2>💰 Balance Management</h2>
      <div class="card">
        <h3>Adjust User Balance</h3>
        <div class="admin-form">
          <input type="text" id="bal-uid" placeholder="User UID" />
          <select id="bal-action">
            <option value="credit">Credit (+)</option>
            <option value="debit">Debit (-)</option>
            <option value="set">Set</option>
          </select>
          <input type="number" id="bal-amount" placeholder="Amount NDOG" min="0" step="0.01" />
          <input type="text" id="bal-reason" placeholder="Reason" />
          <button class="btn btn--primary" id="bal-submit">Apply</button>
        </div>
      </div>
      <div class="card">
        <h3>Recent Transactions</h3>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>UID</th><th>Type</th><th>Amount</th><th>Reason</th><th>Time</th></tr></thead>
            <tbody id="bal-tx-tbody"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>
    `;
    $("#bal-submit").addEventListener("click", async () => {
      const uid = $("#bal-uid").value.trim();
      const action = $("#bal-action").value;
      const amount = Number($("#bal-amount").value);
      const reason = $("#bal-reason").value.trim();
      if (!uid || !Number.isFinite(amount) || amount < 0) return showToast("Invalid input.", "warn");
      if (!reason) return showToast("Reason required.", "warn");
      try {
        if (action === "credit") await db.atomicCredit(uid, amount, `admin_credit:${reason}`, { by: auth.currentUser().uid });
        else if (action === "debit") await db.atomicDebit(uid, amount, `admin_debit:${reason}`, { by: auth.currentUser().uid });
        else if (action === "set") await db.update(`${PATHS.users}/${uid}`, { balance: amount });
        await this._audit(`balance_${action}`, { uid, amount, reason });
        showToast("Balance adjusted.", "success");
        this._loadBalance();
      } catch (e) {
        showToast(e.message || "Failed.", "error");
      }
    });
    // Recent transactions
    const txSnap = await get(query(ref(firebaseDb, PATHS.transactions), limitToLast(50)));
    const txs = txSnap.val() || {};
    const txList = Object.entries(txs).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
    $("#bal-tx-tbody").innerHTML =
      txList.length === 0
        ? '<tr><td colspan="5" class="muted">No transactions.</td></tr>'
        : txList
            .map(
              ([, t]) => `
        <tr>
          <td><code>${(t.uid || "").slice(0, 8)}…</code></td>
          <td>${t.type}</td>
          <td>${formatNDOG(t.amount || 0)}</td>
          <td>${safeHTML(t.reason || "—")}</td>
          <td>${timeAgo(t.ts)}</td>
        </tr>`
            )
            .join("");
  },

  /* ============ Bans ============ */
  async _loadBans() {
    const main = $("#admin-main");
    main.innerHTML = "<h2>🚫 Banned Users</h2><div id='ban-list' class='admin-table-wrap'></div>";
    const snap = await get(ref(firebaseDb, PATHS.bannedUsers));
    const list = snap.val() || {};
    const wrap = $("#ban-list");
    if (Object.keys(list).length === 0) {
      wrap.innerHTML = '<p class="muted">No banned users.</p>';
      return;
    }
    wrap.innerHTML = `<table class="admin-table"><thead><tr><th>UID</th><th>Reason</th><th>Banned By</th><th>Time</th><th>Action</th></tr></thead><tbody>${Object.entries(list)
      .map(
        ([uid, b]) => `
      <tr>
        <td><code>${uid.slice(0, 8)}…</code></td>
        <td>${safeHTML(b.reason || "—")}</td>
        <td><code>${(b.bannedBy || "").slice(0, 8)}…</code></td>
        <td>${timeAgo(b.ts)}</td>
        <td><button class="btn btn--sm btn--primary" data-unban="${uid}">Unban</button></td>
      </tr>`
      )
      .join("")}</tbody></table>`;
    $$("[data-unban]").forEach((b) =>
      b.addEventListener("click", async () => {
        await db.users.unban(b.dataset.unban);
        await this._audit("unban", { uid: b.dataset.unban });
        showToast("Unbanned.", "success");
        this._loadBans();
      })
    );
  },

  /* ============ Missions ============ */
  async _loadMissions() {
    const main = $("#admin-main");
    main.innerHTML = `
      <h2>🎯 Mission Management</h2>
      <div class="card">
        <h3>Create Mission</h3>
        <div class="admin-form">
          <select id="m-type"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="events">Event</option><option value="achievements">Achievement</option></select>
          <input type="text" id="m-title" placeholder="Title" />
          <input type="text" id="m-desc" placeholder="Description" />
          <input type="text" id="m-url" placeholder="Task URL (optional)" />
          <input type="number" id="m-reward" placeholder="Reward NDOG" min="1" />
          <button class="btn btn--primary" id="m-create">Create</button>
        </div>
      </div>
      <div class="card"><h3>Existing Missions</h3><div id="m-list"></div></div>
    `;
    $("#m-create").addEventListener("click", async () => {
      const type = $("#m-type").value;
      const title = $("#m-title").value.trim();
      const description = $("#m-desc").value.trim();
      const url = $("#m-url").value.trim();
      const reward = Number($("#m-reward").value);
      if (!title || !reward) return showToast("Title and reward required.", "warn");
      await db.push(`${PATHS.missions}/${type}`, { title, description, url, reward, createdAt: serverTimestamp() });
      await this._audit("mission_create", { type, title, reward });
      showToast("Mission created.", "success");
      this._loadMissions();
    });
    const snap = await get(ref(firebaseDb, PATHS.missions));
    const data = snap.val() || {};
    const items = [];
    for (const [type, missions] of Object.entries(data)) {
      for (const [id, m] of Object.entries(missions)) {
        items.push({ type, id, ...m });
      }
    }
    $("#m-list").innerHTML = items.length === 0
      ? '<p class="muted">No missions.</p>'
      : `<ul class="admin-list">${items.map((m) => `<li><span class="badge">${m.type}</span> ${safeHTML(m.title)} — ${formatNDOG(m.reward)} <button class="btn btn--sm btn--danger" data-del-mission="${m.type}/${m.id}">Delete</button></li>`).join("")}</ul>`;
    $$("[data-del-mission]").forEach((b) =>
      b.addEventListener("click", async () => {
        await db.remove(`${PATHS.missions}/${b.dataset.delMission}`);
        await this._audit("mission_delete", { key: b.dataset.delMission });
        this._loadMissions();
      })
    );
  },

  /* ============ News ============ */
  async _loadNews() {
    const main = $("#admin-main");
    main.innerHTML = `
      <h2>📰 News Management</h2>
      <div class="card">
        <h3>Post News</h3>
        <div class="admin-form">
          <input type="text" id="n-title" placeholder="Title" />
          <select id="n-cat"><option value="announcement">Announcement</option><option value="event">Event</option><option value="partnership">Partnership</option><option value="update">Update</option></select>
          <textarea id="n-body" placeholder="Body (markdown supported)…" rows="5"></textarea>
          <button class="btn btn--primary" id="n-publish">Publish</button>
        </div>
      </div>
      <div class="card"><h3>Existing Posts</h3><div id="n-list"></div></div>
    `;
    $("#n-publish").addEventListener("click", async () => {
      const title = $("#n-title").value.trim();
      const category = $("#n-cat").value;
      const body = $("#n-body").value.trim();
      if (!title || !body) return showToast("Title and body required.", "warn");
      await db.push(PATHS.news, { title, category, body, author: auth.currentUser().uid, publishedAt: serverTimestamp() });
      await this._audit("news_publish", { title });
      showToast("News published.", "success");
      this._loadNews();
    });
    const snap = await get(ref(firebaseDb, PATHS.news));
    const news = snap.val() || {};
    const items = Object.entries(news).sort((a, b) => (b[1].publishedAt || 0) - (a[1].publishedAt || 0));
    $("#n-list").innerHTML = items.length === 0
      ? '<p class="muted">No news.</p>'
      : `<ul class="admin-list">${items.map(([id, n]) => `<li><span class="badge">${n.category}</span> ${safeHTML(n.title)} <button class="btn btn--sm btn--danger" data-del-news="${id}">Delete</button></li>`).join("")}</ul>`;
    $$("[data-del-news]").forEach((b) =>
      b.addEventListener("click", async () => {
        await db.remove(`${PATHS.news}/${b.dataset.delNews}`);
        await this._audit("news_delete", { id: b.dataset.delNews });
        this._loadNews();
      })
    );
  },

  /* ============ Fraud Monitor ============ */
  async _loadFraud() {
    const main = $("#admin-main");
    main.innerHTML = `
      <h2>🛡️ Fraud Monitor</h2>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Type</th><th>UID</th><th>Severity</th><th>FP</th><th>Time</th><th>Details</th></tr></thead>
          <tbody id="fraud-tbody"><tr><td colspan="6" class="muted">Loading…</td></tr></tbody>
        </table>
      </div>
    `;
    const snap = await get(query(ref(firebaseDb, PATHS.fraudLogs), limitToLast(200)));
    const logs = snap.val() || {};
    const items = Object.entries(logs).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
    $("#fraud-tbody").innerHTML = items.length === 0
      ? '<tr><td colspan="6" class="muted">No fraud events.</td></tr>'
      : items.map(([, l]) => `
        <tr class="fraud-row fraud-row--${l.severity || "low"}">
          <td>${safeHTML(l.type || "—")}</td>
          <td><code>${(l.uid || "").slice(0, 8)}…</code></td>
          <td><span class="badge badge--${l.severity || "low"}">${l.severity || "low"}</span></td>
          <td><code>${(l.fingerprint || "").slice(0, 8)}…</code></td>
          <td>${timeAgo(l.ts)}</td>
          <td><button class="btn btn--sm btn--ghost" data-fraud-detail='${JSON.stringify(l).replace(/'/g, "&#39;")}'>View</button></td>
        </tr>`).join("");
  },

  /* ============ Analytics ============ */
  async _loadAnalytics() {
    const main = $("#admin-main");
    main.innerHTML = `
      <h2>📈 Analytics</h2>
      <div class="admin-cards">
        <div class="card"><div class="card__label">DAU (today)</div><div class="card__value" id="a-dau">—</div></div>
        <div class="card"><div class="card__label">Claims (24h)</div><div class="card__value" id="a-claims">—</div></div>
        <div class="card"><div class="card__label">New Users (24h)</div><div class="card__value" id="a-new">—</div></div>
        <div class="card"><div class="card__label">Staking Volume</div><div class="card__value" id="a-stake">—</div></div>
      </div>
      <div class="card"><canvas id="a-chart" height="120"></canvas></div>
    `;
    // Compute simple stats
    const dayAgo = Date.now() - 86400000;
    const [claimsSnap, usersSnap, stakesSnap] = await Promise.all([
      get(ref(firebaseDb, PATHS.claims)),
      get(ref(firebaseDb, PATHS.users)),
      get(ref(firebaseDb, PATHS.stakingContracts))
    ]);
    const claims = claimsSnap.val() || {};
    const users = usersSnap.val() || {};
    const stakes = stakesSnap.val() || {};
    const claims24h = Object.values(claims).filter((c) => (c.ts?.seconds ? c.ts.seconds * 1000 : c.ts || 0) >= dayAgo).length;
    const new24h = Object.values(users).filter((u) => (u.createdAt?.seconds ? u.createdAt.seconds * 1000 : u.createdAt || 0) >= dayAgo).length;
    const stakeVol = Object.values(stakes).filter((s) => (s.startedAt?.seconds ? s.startedAt.seconds * 1000 : s.startedAt || 0) >= dayAgo).reduce((sum, s) => sum + (s.amount || 0), 0);
    const dau = new Set(Object.values(claims).filter((c) => (c.ts?.seconds ? c.ts.seconds * 1000 : c.ts || 0) >= dayAgo).map((c) => c.uid)).size;
    $("#a-dau").textContent = formatNumber(dau);
    $("#a-claims").textContent = formatNumber(claims24h);
    $("#a-new").textContent = formatNumber(new24h);
    $("#a-stake").textContent = formatNDOG(stakeVol);

    // Simple bar chart of last 7 days claims
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const start = Date.now() - i * 86400000;
      const end = start + 86400000;
      const count = Object.values(claims).filter((c) => {
        const ts = c.ts?.seconds ? c.ts.seconds * 1000 : c.ts || 0;
        return ts >= start && ts < end;
      }).length;
      days.push({ label: new Date(start).toLocaleDateString(undefined, { weekday: "short" }), count });
    }
    import("./charts.js").then((m) => m.charts.bar($("#a-chart"), days.map((d) => d.label), days.map((d) => d.count), "#f59e0b"));
  },

  /* ============ Audit Log ============ */
  async _audit(action, details) {
    try {
      await db.push("adminAuditLog", {
        adminUid: auth.currentUser().uid,
        action,
        details,
        ts: serverTimestamp()
      });
    } catch (e) {
      console.warn("[admin] audit failed:", e);
    }
  }
};

window.__admin = admin;
