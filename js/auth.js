/** 
 * NileDogs (NDOG) — Authentication Module
 * v2.0.3 - POPUP-ONLY + NO FINGERPRINT
 * =====================================================
 * - تم إزالة signInWithRedirect بالكامل (سبب الخطأ).
 * - الاعتماد فقط على signInWithPopup (يعمل على جميع الأجهزة).
 * - في حال حظر النافذة المنبثقة، يتم عرض رسالة توجيهية للمستخدم.
 * - تم تعطيل بصمة الجهاز نهائياً (قيمة ثابتة).
 * =====================================================
 */

import {
  auth, db, googleProvider, APP_CONFIG,
  ref, get, set, update, push, onValue,
  signInWithPopup, signOut, onAuthStateChanged,
  generateReferralCode
} from "./firebase-config.js";
import { t } from "./i18n.js";

let currentUserData = null;
let listeners = [];
let authInitialized = false;

export function onUser(cb) {
  listeners.push(cb);
  if (currentUserData) cb(currentUserData);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

function emit(user) {
  currentUserData = user;
  console.log("[NDOG] Emitting user state:", user ? `uid=${user.uid}` : "null");
  listeners.forEach(l => l(user));
}

export function getCurrentUser() { return currentUserData; }

function isMobile() {
  return /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
}

function isEmbeddedBrowser() {
  const ua = navigator.userAgent || navigator.vendor || "";
  return /Telegram|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Twitter|TikTok|Snapchat|; ?wv\)/i.test(ua);
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  const msg  = err?.message || "";
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return t("auth.errPopupClosed");
    case "auth/popup-blocked":
      return t("auth.errPopupBlocked");
    case "auth/operation-not-allowed":
      return t("auth.errNotEnabled");
    case "auth/network-request-failed":
      return t("auth.errNetwork");
    case "auth/operation-not-supported-in-this-environment":
      return t("auth.errEnv");
    default:
      return msg || t("auth.errGeneric");
  }
}

export async function googleLogin() {
  // منع تسجيل الدخول من المتصفحات المدمجة (تطبيقات مثل تيليجرام، فيسبوك)
  if (isEmbeddedBrowser()) {
    console.warn("[NDOG] Blocked login attempt inside an embedded/in-app browser");
    const e = new Error(t("auth.errEmbeddedBrowser"));
    e.code = "auth/embedded-browser";
    throw e;
  }

  console.log("[NDOG] Attempting signInWithPopup...");
  try {
    await signInWithPopup(auth, googleProvider);
    console.log("[NDOG] Popup sign-in successful.");
  } catch (err) {
    console.error("[NDOG] Popup sign-in error:", err.code, err.message);
    // إذا تم حظر النافذة المنبثقة، نرمي خطأ واضحاً للمستخدم
    if (err.code === "auth/popup-blocked") {
      const e = new Error(t("auth.errPopupBlocked"));
      e.code = err.code;
      throw e;
    }
    // أخطاء أخرى نمررها كما هي
    const friendly = friendlyAuthError(err);
    const e = new Error(friendly);
    e.original = err;
    throw e;
  }
}

export async function logout() {
  try {
    await signOut(auth);
    location.reload();
  } catch (err) {
    console.error("[NDOG] Logout failed:", err);
  }
}

// ─── Provisioning ────────────────────────────────────────────────
const provisioningInFlight = new Map();

function provisionUserLocked(firebaseUser) {
  const uid = firebaseUser.uid;
  if (provisioningInFlight.has(uid)) {
    console.log("[NDOG] Provisioning already in flight for:", uid);
    return provisioningInFlight.get(uid);
  }
  console.log("[NDOG] Starting provisioning for:", uid);
  const p = provisionUserImpl(firebaseUser).finally(() => {
    provisioningInFlight.delete(uid);
  });
  provisioningInFlight.set(uid, p);
  return p;
}

async function provisionUserImpl(firebaseUser) {
  const uid = firebaseUser.uid;
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);

  // بصمة الجهاز معطلة – قيمة ثابتة
  const fingerprint = "disabled_fingerprint";

  if (!snap.exists()) {
    const referralCode = generateReferralCode();
    const urlRef = new URLSearchParams(location.search).get("ref");
    const storedRef = sessionStorage.getItem("ndog_ref");
    const referredBy = urlRef || storedRef || null;

    const name = firebaseUser.displayName || "NileDog " + referralCode.slice(-4);
    const country = guessCountry();

    const newUserData = {
      uid,
      name,
      email:        firebaseUser.email || "",
      photoURL:     firebaseUser.photoURL || "",
      balance:      0,
      country,
      rank:         "Bronze",
      level:        1,
      referralCode,
      referredBy,
      totalReferrals: 0,
      activeReferrals: 0,
      communityScore: 0,
      loyaltyScore:   10,
      createdAt:    Date.now(),
      lastClaim:    0,
      streak:       0,
      deviceFingerprint: fingerprint,
      banned:       false,
      isFounder:    true,
      badges:       { founder: true }
    };

    await set(userRef, newUserData);

    if (referredBy) {
      await processReferral(uid, referredBy);
    }

    await push(ref(db, `claims`), {
      userId: uid,
      amount: 0,
      type:   "welcome",
      date:   Date.now()
    });

    console.log("[NDOG] New user provisioned:", name);
    return newUserData;
  }

  const existing = snap.val();
  const patch = {};
  if (existing.photoURL !== firebaseUser.photoURL && firebaseUser.photoURL) {
    patch.photoURL = firebaseUser.photoURL;
  }
  if (firebaseUser.displayName && existing.name !== firebaseUser.displayName) {
    patch.name = firebaseUser.displayName;
  }
  if (Object.keys(patch).length) await update(userRef, patch);

  return { ...existing, ...patch };
}

async function processReferral(newUid, refCode) {
  try {
    const usersSnap = await get(ref(db, "users"));
    if (!usersSnap.exists()) return;

    let referrerUid = null;
    usersSnap.forEach(child => {
      if (child.val().referralCode === refCode) referrerUid = child.key;
    });
    if (!referrerUid || referrerUid === newUid) return;

    const now = Date.now();

    await push(ref(db, "referrals"), {
      referrer:     referrerUid,
      referredUser: newUid,
      level:        1,
      createdAt:    now
    });

    await update(ref(db, `users/${referrerUid}`), {
      balance:        (await bal(referrerUid)) + APP_CONFIG.referralReward.l1,
      totalReferrals: (await tRefs(referrerUid)) + 1,
      communityScore: (await cScore(referrerUid)) + 10
    });

    const l1Snap = await get(ref(db, `users/${referrerUid}`));
    if (l1Snap.exists() && l1Snap.val().referredBy) {
      const l2Code = l1Snap.val().referredBy;
      let l2Uid = null;
      usersSnap.forEach(child => {
        if (child.val().referralCode === l2Code) l2Uid = child.key;
      });
      if (l2Uid) {
        await push(ref(db, "referrals"), {
          referrer:     l2Uid,
          referredUser: newUid,
          level:        2,
          createdAt:    now
        });
        await update(ref(db, `users/${l2Uid}`), {
          balance: (await bal(l2Uid)) + APP_CONFIG.referralReward.l2
        });

        const l2Snap = await get(ref(db, `users/${l2Uid}`));
        if (l2Snap.exists() && l2Snap.val().referredBy) {
          const l3Code = l2Snap.val().referredBy;
          let l3Uid = null;
          usersSnap.forEach(child => {
            if (child.val().referralCode === l3Code) l3Uid = child.key;
          });
          if (l3Uid) {
            await push(ref(db, "referrals"), {
              referrer:     l3Uid,
              referredUser: newUid,
              level:        3,
              createdAt:    now
            });
            await update(ref(db, `users/${l3Uid}`), {
              balance: (await bal(l3Uid)) + APP_CONFIG.referralReward.l3
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[NDOG] Referral processing failed:", err);
  }
}

async function bal(uid)  { const s = await get(ref(db, `users/${uid}/balance`)); return s.exists() ? s.val() : 0; }
async function tRefs(uid) { const s = await get(ref(db, `users/${uid}/totalReferrals`)); return s.exists() ? s.val() : 0; }
async function cScore(uid){ const s = await get(ref(db, `users/${uid}/communityScore`)); return s.exists() ? s.val() : 0; }

function guessCountry() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const lang = navigator.language || "";
  if (tz.includes("Cairo") || lang.startsWith("ar")) return "Egypt";
  if (tz.includes("Riyadh")) return "Saudi Arabia";
  if (tz.includes("Dubai")) return "UAE";
  if (tz.includes("America")) return "United States";
  if (tz.includes("Europe")) return "Europe";
  if (tz.includes("Asia")) return "Asia";
  return "Global";
}

// ─── تهيئة المصادقة ─────────────────────────────────────────────
export async function initAuth(onReady) {
  if (authInitialized) {
    console.log("[NDOG] Auth already initialized, skipping");
    return;
  }
  authInitialized = true;

  console.log("[NDOG] === AUTH INITIALIZATION START (Popup-Only) ===");
  console.log("[NDOG] Device type:", isMobile() ? "MOBILE" : "DESKTOP");

  let userSetupDone = new Map();

  onAuthStateChanged(auth, async (fbUser) => {
    console.log("[NDOG] onAuthStateChanged fired:", fbUser ? `uid=${fbUser.uid}` : "null");

    if (!fbUser) {
      console.log("[NDOG] No authenticated user");
      emit(null);
      onReady && onReady(null);
      return;
    }

    const uid = fbUser.uid;

    if (userSetupDone.has(uid)) {
      console.log("[NDOG] User", uid, "already set up, skipping duplicate");
      return;
    }
    userSetupDone.set(uid, true);

    console.log("[NDOG] Starting user setup for:", uid, fbUser.email);

    try {
      const userRef = ref(db, `users/${uid}`);
      const snap = await get(userRef);

      let userData;
      if (!snap.exists()) {
        console.log("[NDOG] User record doesn't exist - provisioning...");
        userData = await provisionUserLocked(fbUser);
        console.log("[NDOG] User provisioned successfully:", userData.name);
      } else {
        userData = snap.val();
        const patch = {};
        if (userData.photoURL !== fbUser.photoURL && fbUser.photoURL) {
          patch.photoURL = fbUser.photoURL;
        }
        if (fbUser.displayName && userData.name !== fbUser.displayName) {
          patch.name = fbUser.displayName;
        }
        if (Object.keys(patch).length) {
          await update(userRef, patch);
          userData = { ...userData, ...patch };
        }
      }

      if (userData.banned) {
        console.log("[NDOG] User is banned");
        document.getElementById("bannedModal")?.classList.remove("hidden");
        return;
      }

      console.log("[NDOG] Authentication complete:", {
        uid: userData.uid,
        name: userData.name,
        balance: userData.balance
      });

      emit(userData);
      onReady && onReady(userData);

      // مراقبة التحديثات اللحظية
      onValue(userRef, (liveSnap) => {
        if (!liveSnap.exists()) return;
        const liveData = liveSnap.val();
        if (liveData.banned) {
          document.getElementById("bannedModal")?.classList.remove("hidden");
          return;
        }
        console.log("[NDOG] Real-time user data update");
        emit(liveData);
      });

    } catch (err) {
      console.error("[NDOG] User setup failed:", err);

      // بيانات احتياطية لإبقاء المستخدم داخل التطبيق
      const fallbackData = {
        uid: fbUser.uid,
        name: fbUser.displayName || "NileDog",
        email: fbUser.email || "",
        photoURL: fbUser.photoURL || "",
        balance: 0,
        country: guessCountry(),
        rank: "Bronze",
        level: 1,
        referralCode: "",
        totalReferrals: 0,
        activeReferrals: 0,
        communityScore: 0,
        loyaltyScore: 10,
        createdAt: Date.now(),
        lastClaim: 0,
        streak: 0,
        isFounder: true,
        badges: { founder: true }
      };

      console.log("[NDOG] Using fallback data — user will see dashboard");
      emit(fallbackData);
      onReady && onReady(fallbackData);

      // إعادة المحاولة بعد فترة
      userSetupDone.delete(uid);
      setTimeout(async () => {
        if (currentUserData?.uid === uid && !currentUserData?.referralCode) {
          console.log("[NDOG] Retrying provisioning...");
          try {
            const userData = await provisionUserLocked(fbUser);
            emit(userData);
          } catch (retryErr) {
            console.error("[NDOG] Provisioning retry failed:", retryErr);
          }
        }
      }, 3000);
    }
  });

  console.log("[NDOG] === AUTH INITIALIZATION COMPLETE ===");
}
