/**
 * NileDogs (NDOG) — Authentication Module
 * v2.1.0 - POPUP + REDIRECT FALLBACK (SAFE)
 * =====================================================
 * - Desktop: signInWithPopup first, fallback to signInWithRedirect
 *   if COOP blocks the popup.
 * - Mobile: signInWithRedirect directly (popups unreliable on mobile).
 * - getRedirectResult is consumed ONCE on init to avoid loops.
 * - signInWithRedirect is ONLY triggered by explicit user click.
 * - No location.reload() anywhere — onAuthStateChanged drives the UI.
 * - Device fingerprint disabled.
 * =====================================================
 */

import {
  auth, db, googleProvider, APP_CONFIG,
  ref, get, set, update, push, onValue,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged,
  generateReferralCode
} from "./firebase-config.js?v=2.0.5";
import { t } from "./i18n.js?v=2.0.5";

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
  // Block login from embedded/in-app browsers
  if (isEmbeddedBrowser()) {
    console.warn("[NDOG] Blocked login attempt inside an embedded/in-app browser");
    const e = new Error(t("auth.errEmbeddedBrowser"));
    e.code = "auth/embedded-browser";
    throw e;
  }

  console.log("[NDOG] Login attempt — using signInWithRedirect (COOP-safe)");

  // ─── REDIRECT FOR ALL DEVICES ───────────────────────────────
  // The site has a Cross-Origin-Opener-Policy header (set by the
  // hosting CDN) that blocks signInWithPopup on all devices.
  // signInWithRedirect bypasses this entirely because it navigates
  // the main window instead of opening a popup.
  try {
    await signInWithRedirect(auth, googleProvider);
    // The page will now navigate to Google sign-in.
    // On return, getRedirectResult (in initAuth) handles the result.
    return;
  } catch (err) {
    console.error("[NDOG] Redirect sign-in error:", err.code, err.message);
    const friendly = friendlyAuthError(err);
    const e = new Error(friendly);
    e.code = err.code;
    e.original = err;
    throw e;
  }
}

export async function logout() {
  try {
    await signOut(auth);
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

// ─── Auth Initialization ─────────────────────────────────────────
export async function initAuth(onReady) {
  if (authInitialized) {
    console.log("[NDOG] Auth already initialized, skipping");
    return;
  }
  authInitialized = true;

  console.log("[NDOG] === AUTH INITIALIZATION START (Popup + Redirect) ===");
  console.log("[NDOG] Device type:", isMobile() ? "MOBILE" : "DESKTOP");

  // ── CRITICAL: Consume pending redirect result FIRST ────────────
  // When signInWithRedirect completes, Firebase stores the credential
  // in a temporary storage. getRedirectResult() consumes it and
  // returns the signed-in user. If we don't call this, the result
  // sits unprocessed and onAuthStateChanged may not fire correctly
  // on the redirected page load.
  //
  // This is called ONCE here and never again, preventing infinite loops.
  try {
    console.log("[NDOG] Checking for pending redirect result...");
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      console.log("[NDOG] Redirect result received for:", result.user.uid);
      // The user is now signed in — onAuthStateChanged below will
      // fire with this user and handle provisioning/UI.
    } else {
      console.log("[NDOG] No pending redirect result");
    }
  } catch (err) {
    // Errors here mean the redirect auth failed (user cancelled,
    // network error, etc.). Log it but don't crash — onAuthStateChanged
    // will fire with null and show the login screen.
    console.error("[NDOG] getRedirectResult error:", err.code, err.message);
  }

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

      // Real-time updates
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

      console.log("[NDOG] Using fallback data");
      emit(fallbackData);
      onReady && onReady(fallbackData);

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