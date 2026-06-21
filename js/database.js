/**
 * FILE NAME: js/database.js
 * PURPOSE: Data Access Layer. Wraps all Realtime DB operations with
 *          validation, transactions, and typed helpers. Single source of truth
 *          for collection paths and atomic operations.
 * DEPENDENCIES: firebase.js (firebaseDb), utils.js
 * EXPORTS: db.users, db.claims, db.referrals, db.missions, db.airdrops,
 *          db.leaderboards, db.staking, db.transactions, db.notifications,
 *          db.news, db.admins, db.analytics, db.fraudLogs, db.bannedUsers,
 *          db.atomicCredit, db.atomicDebit
 */

import { firebaseDb } from "./firebase.js";
import {
  ref,
  get,
  set,
  update,
  push,
  remove,
  runTransaction,
  onValue,
  off,
  query,
  orderByChild,
  orderByKey,
  orderByValue,
  limitToFirst,
  limitToLast,
  startAt,
  endAt,
  equalTo,
  serverTimestamp,
  connectDatabaseEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* Path constants — keep in sync with database.rules.json */
export const PATHS = {
  users: "users",
  claims: "claims",
  referrals: "referrals",
  missions: "missions",
  missionProgress: "missionProgress",
  airdrops: "airdrops",
  airdropClaims: "airdropClaims",
  leaderboards: "leaderboards",
  staking: "staking",
  stakingContracts: "stakingContracts",
  transactions: "transactions",
  notifications: "notifications",
  news: "news",
  admins: "admins",
  analytics: "analytics",
  fraudLogs: "fraudLogs",
  bannedUsers: "bannedUsers",
  devices: "devices",
  sessions: "sessions",
  referralCodes: "referralCodes",
  wheelSpins: "wheelSpins",
  adminAlerts: "adminAlerts",
  leaderboards_global: "leaderboards/global",
  leaderboards_country: "leaderboards/country",
  leaderboards_referral: "leaderboards/referral",
  leaderboards_weekly: "leaderboards/weekly",
  leaderboards_monthly: "leaderboards/monthly",
  leaderboards_alltime: "leaderboards/alltime"
};

export const db = {
  /* ============ Generic helpers ============ */
  path(pathStr) {
    return ref(firebaseDb, pathStr);
  },

  async get(pathStr) {
    const snap = await get(this.path(pathStr));
    return snap.exists() ? snap.val() : null;
  },

  async set(pathStr, value) {
    return set(this.path(pathStr), value);
  },

  async update(pathStr, partial) {
    return update(this.path(pathStr), partial);
  },

  async push(pathStr, value) {
    const r = push(this.path(pathStr));
    await set(r, value);
    return r.key;
  },

  async remove(pathStr) {
    return remove(this.path(pathStr));
  },

  async transaction(pathStr, fn) {
    return runTransaction(this.path(pathStr), fn);
  },

  on(pathStr, cb, opts = {}) {
    let q = this.path(pathStr);
    if (opts.orderByChild) q = query(q, orderByChild(opts.orderByChild));
    if (opts.orderByKey) q = query(q, orderByKey());
    if (opts.orderByValue) q = query(q, orderByValue());
    if (opts.limitToFirst) q = query(q, limitToFirst(opts.limitToFirst));
    if (opts.limitToLast) q = query(q, limitToLast(opts.limitToLast));
    if (opts.equalTo) q = query(q, equalTo(opts.equalTo));
    if (opts.startAt) q = query(q, startAt(opts.startAt));
    if (opts.endAt) q = query(q, endAt(opts.endAt));
    onValue(q, cb);
    return () => off(q);
  },

  /* ============ Atomic credit (with transaction record) ============ */
  async atomicCredit(uid, amount, reason, meta = {}) {
    if (!uid || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid credit params");
    }
    // 1. Increment balance atomically
    const balSnap = await runTransaction(this.path(`${PATHS.users}/${uid}/balance`), (cur) => Math.max(0, (cur || 0) + amount));
    // 2. Record transaction
    await this.push(PATHS.transactions, {
      uid,
      type: "credit",
      amount,
      reason,
      ...meta,
      ts: serverTimestamp(),
      balanceAfter: balSnap.committed ? balSnap.snapshot.val() : null
    });
    return balSnap;
  },

  async atomicDebit(uid, amount, reason, meta = {}) {
    if (!uid || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid debit params");
    }
    const balSnap = await runTransaction(this.path(`${PATHS.users}/${uid}/balance`), (cur) => {
      const c = cur || 0;
      if (c < amount) throw new Error("Insufficient balance");
      return c - amount;
    });
    await this.push(PATHS.transactions, {
      uid,
      type: "debit",
      amount,
      reason,
      ...meta,
      ts: serverTimestamp(),
      balanceAfter: balSnap.committed ? balSnap.snapshot.val() : null
    });
    return balSnap;
  },

  /* ============ Domain helpers ============ */
  users: {
    get(uid) {
      return db.get(`${PATHS.users}/${uid}`);
    },
    on(uid, cb) {
      return db.on(`${PATHS.users}/${uid}`, cb);
    },
    async update(uid, patch) {
      return db.update(`${PATHS.users}/${uid}`, { ...patch, updatedAt: serverTimestamp() });
    },
    async ban(uid, reason, bannedBy) {
      await db.update(`${PATHS.users}/${uid}`, { banned: true, banReason: reason, bannedBy, bannedAt: serverTimestamp() });
      await db.set(`${PATHS.bannedUsers}/${uid}`, { reason, bannedBy, ts: serverTimestamp() });
    },
    async unban(uid) {
      await db.update(`${PATHS.users}/${uid}`, { banned: false, banReason: null, bannedBy: null, bannedAt: null });
      await db.remove(`${PATHS.bannedUsers}/${uid}`);
    },
    async setRole(uid, role) {
      if (!["user", "mod", "admin"].includes(role)) throw new Error("Invalid role");
      await db.update(`${PATHS.users}/${uid}`, { role });
      if (role === "admin" || role === "mod") {
        await db.set(`${PATHS.admins}/${uid}`, { role, ts: serverTimestamp() });
      } else {
        await db.remove(`${PATHS.admins}/${uid}`);
      }
    }
  },

  claims: {
    async log(uid, amount, streak, multiplier) {
      return db.push(PATHS.claims, {
        uid,
        amount,
        streak,
        multiplier,
        ts: serverTimestamp()
      });
    },
    history(uid, limit = 50) {
      return db.get(`${PATHS.claims}`, {
        orderByChild: "uid",
        equalTo: uid,
        limitToLast: limit
      });
    }
  },

  referrals: {
    async list(uid) {
      return db.get(`${PATHS.referrals}/${uid}`);
    },
    async tree(uid, depth = 3) {
      const tree = { uid, level: 0, children: [] };
      const seen = new Set([uid]);
      async function walk(node, currentDepth) {
        if (currentDepth >= depth) return;
        const snaps = await db.get(`${PATHS.referrals}/${node.uid}`);
        if (!snaps) return;
        for (const [k, v] of Object.entries(snaps)) {
          if (v.referredUid && !seen.has(v.referredUid)) {
            seen.add(v.referredUid);
            const child = { uid: v.referredUid, level: v.level, reward: v.reward, key: k, children: [] };
            node.children.push(child);
            await walk(child, currentDepth + 1);
          }
        }
      }
      await walk(tree, 0);
      return tree;
    }
  },

  missions: {
    list() {
      return db.get(PATHS.missions);
    },
    async progress(uid, missionId) {
      const v = await db.get(`${PATHS.missionProgress}/${uid}/${missionId}`);
      return v || null;
    },
    async complete(uid, missionId, reward) {
      await db.set(`${PATHS.missionProgress}/${uid}/${missionId}`, {
        completed: true,
        completedAt: serverTimestamp(),
        reward
      });
      await db.atomicCredit(uid, reward, `mission:${missionId}`);
    }
  },

  staking: {
    async create(uid, amount, days, apr) {
      const id = await db.push(PATHS.stakingContracts, {
        uid,
        amount,
        days,
        apr,
        startedAt: serverTimestamp(),
        endsAt: serverTimestamp(),
        status: "active",
        rewardsAccrued: 0
      });
      // Set endsAt as offset from now
      await db.update(`${PATHS.stakingContracts}/${id}`, {
        endsAt: Date.now() + days * 86400000
      });
      return id;
    },
    list(uid) {
      return db.get(`${PATHS.stakingContracts}`, {
        orderByChild: "uid",
        equalTo: uid
      });
    }
  },

  news: {
    list(limit = 20) {
      return db.get(PATHS.news, { limitToLast: limit });
    }
  },

  notifications: {
    async send(uid, title, body, type = "info") {
      return db.push(`${PATHS.notifications}/${uid}`, {
        title,
        body,
        type,
        read: false,
        ts: serverTimestamp()
      });
    },
    list(uid) {
      return db.on(`${PATHS.notifications}/${uid}`, () => {});
    }
  },

  leaderboards: {
    get(board) {
      return db.get(`${PATHS.leaderboards}/${board}`);
    },
    on(board, cb) {
      return db.on(`${PATHS.leaderboards}/${board}`, cb, { orderByValue: true, limitToLast: 100 });
    }
  },

  /* ============ Server timestamp helper ============ */
  now() {
    return serverTimestamp();
  }
};

window.__db = db;
