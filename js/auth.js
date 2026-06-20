/**
 * NileDogs (NDOG) — Authentication Module
 * v1.4.0 MOBILE LOGIN FIX (popup-first + embedded-browser guard):
 *   • signInWithPopup is now tried first on ALL devices (mobile included).
 *     signInWithRedirect requires sessionStorage/IndexedDB to survive a
 *     full-page round trip to Google and back; many mobile browsers and
 *     especially in-app WebViews (Telegram, Facebook, Instagram, etc.)
 *     clear/partition that storage, silently breaking getRedirectResult()
 *     and leaving the user stuck on the login screen with no error.
 *   • signInWithRedirect is now only a fallback when the popup itself is
 *     blocked or unsupported in the current environment.
 *   • Embedded in-app browsers are detected up front and shown a clear
 *     "open this in Chrome/Safari" message instead of attempting a login
 *     Google will block anyway.
 *   • If a redirect WAS attempted but no result comes back (the silent
 *     storage-loss case), the user now sees an explicit error instead of
 *     just sitting on the login screen forever.
 */

import {
  auth, db, googleProvider, APP_CONFIG,
  ref, get, set, update, push, onValue,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged,
  generateReferralCode, getDeviceFingerprint
} from "./firebase-config.js";
import { t } from "./i18n.js";
import { setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

// In-app browsers (Telegram, Facebook, Instagram, Line, WeChat, Twitter/X,
// TikTok, Snapchat) and bare Android WebViews ("; wv)") commonly:
//   1) get blocked outright by Google ("disallowed_useragent"), or
//   2) silently clear/partition sessionStorage + IndexedDB across the
//      full-page redirect, which breaks getRedirectResult() with NO error —
//      the user just lands back on the login screen as if nothing happened.
// This is almost certainly what users were hitting on mobile.
function isEmbeddedBrowser() {
  const ua = navigator.userAgent || navigator.vendor || "";
  return /Telegram|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Twitter|TikTok|Snapchat|; ?wv\)/i.test(ua);
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  const msg  = err?.message || "";
  switch (code) {
    case "auth/unauthorized-domain":
      return t("auth.errUnauthorizedDomain");
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return t("auth.errPopupClosed");
    case "auth/popup-blocked":
      return t("auth.errPopupBlocked");
    case "auth/operation-not-allowed":
      return t("auth.errNotEnabled");
    case "auth/network-request-failed":
      return t("auth.errNetwork");
    case "auth/redirect-operation-pending":
      return t("auth.errRedirectPending");
    case "auth/operation-not-supported-in-this-environment":
      return t("auth.errEnv");
    default:
      return msg || t("auth.errGeneric");
  }
}

export async function googleLogin() {
  if (isEmbeddedBrowser()) {
    console.warn("[NDOG] Blocked login attempt inside an embedded/in-app browser");
    const e = new Error(t("auth.errEmbeddedBrowser"));
    e.code = "auth/embedded-browser";
    throw e;
  }
    // On iOS Safari, signInWithPopup often fails silently (user-gesture context
    // is lost after async operations). Use redirect directly on iOS Safari.
    const isIosSafari = /iP(hone|ad|od)/i.test(navigator.userAgent) &&
          /WebKit/i.test(navigator.userAgent) &&
          !/CriOS|FxiOS|OPiOS|mercury/i.test(navigator.userAgent);
    if (isIosSafari) {
          console.log("[NDOG] iOS Safari detected - using signInWithRedirect directly");
          sessionStorage.setItem("ndog_redirect_pending", "1");
          await signInWithRedirect(auth, googleProvider);
          return;
        }

  // CRITICAL FIX: prefer signInWithPopup even on mobile.
  // signInWithRedirect requires sessionStorage/IndexedDB state to survive a
  // full-page round trip to accounts.google.com and back. Many mobile
  // browsers (and especially in-app WebViews) clear or partition that
  // storage, which silently breaks getRedirectResult() — the user just
  // stays on the login screen with no error. A popup never navigates the
  // page away, so it sidesteps that failure mode entirely. We only fall
  // back to redirect if the popup itself is blocked/unsupported.
  try {
    console.log("[NDOG] Attempting signInWithPopup (preferred on all devices)");
    await signInWithPopup(auth, googleProvider);
    return;
  } catch (err) {
    const fallbackToRedirect = [
      "auth/popup-blocked",
      "auth/operation-not-supported-in-this-environment",
      "auth/cancelled-popup-request"
    ].includes(err?.code);

    if (!fallbackToRedirect) {
      console.error("[NDOG] Google login failed:", err.code, err.message);
      const friendly = friendlyAuthError(err);
      const e = new Error(friendly);
      e.original = err;
      throw e;
    }

    console.log("[NDOG] Popup unavailable (", err.code, ") — falling back to signInWithRedirect");
  }

  try {
    // Mark that a redirect is in flight so initAuth() can detect the case
    // where the round trip completes but the result was lost in storage.
    sessionStorage.setItem("ndog_redirect_pending", "1");
    await signInWithRedirect(auth, googleProvider);
  } catch (err) {
    sessionStorage.removeItem("ndog_redirect_pending");
    console.error("[NDOG] Google login failed:", err.code, err.message);
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

  const fingerprint = await getDeviceFingerprint();
  const fpRef = ref(db, `deviceFingerprints/${fingerprint}`);
  const fpSnap = await get(fpRef);
  if (fpSnap.exists() && fpSnap.val() !== uid) {
    await set(ref(db, `flaggedAccounts/${uid}`), {
      reason: "duplicate_device_fingerprint",
      otherUid: fpSnap.val(),
      at: Date.now()
    });
  }
  await set(fpRef, uid);

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

export async function initAuth(onReady) {
  if (authInitialized) {
    console.log("[NDOG] Auth already initialized, skipping");
    return;
  }
  authInitialized = true;

  console.log("[NDOG] === AUTH INITIALIZATION START ===");
  console.log("[NDOG] Device type:", isMobile() ? "MOBILE" : "DESKTOP");
    // Ensure persistence is active before reading redirect result (fixes mobile race)
    try { await setPersistence(auth, browserLocalPersistence); } catch (_) {}

  // CRITICAL: Call getRedirectResult FIRST, BEFORE listening to onAuthStateChanged
  // This is the most critical part for mobile redirect flow
  let redirectResult = null;
  try {
    console.log("[NDOG] [1/3] Calling getRedirectResult()...");
    redirectResult = await getRedirectResult(auth);

    const wasPending = sessionStorage.getItem("ndog_redirect_pending") === "1";
    sessionStorage.removeItem("ndog_redirect_pending");

    if (redirectResult?.user) {
      console.log("[NDOG] [1/3] ✅ Redirect result received for:", redirectResult.user.uid);
      console.log("[NDOG] Redirect user email:", redirectResult.user.email);
    } else if (wasPending) {
      // We sent the user to Google via signInWithRedirect, the page came
      // back, but there is no result AND no auth/* error was thrown. This
      // is the classic "silently lost across the redirect" failure (storage
      // cleared/partitioned by the browser) — surface it instead of leaving
      // the user stuck on the login screen with no explanation.
      console.warn("[NDOG] [1/3] ⚠️ Expected a redirect result but got none — likely lost in storage");
      document.dispatchEvent(new CustomEvent("ndog:authError", {
        detail: { message: t("auth.errRedirectIncomplete") }
      }));
    } else {
      console.log("[NDOG] [1/3] No redirect result (normal for first visit or non-redirect flow)");
    }
  } catch (err) {
    sessionStorage.removeItem("ndog_redirect_pending");
    console.error("[NDOG] [1/3] ❌ getRedirectResult error:", err.code, err.message);
    document.dispatchEvent(new CustomEvent("ndog:authError", {
      detail: { message: friendlyAuthError(err) }
    }));
    return;
  }

  // Now that we've consumed the redirect result, set up auth state listener
  console.log("[NDOG] [2/3] Setting up onAuthStateChanged listener...");
  
  onAuthStateChanged(auth, async (fbUser) => {
    console.log("[NDOG] [2/3] onAuthStateChanged fired:", fbUser ? `uid=${fbUser.uid}` : "null");
    
    if (!fbUser) {
      console.log("[NDOG] No authenticated user");
      emit(null);
      onReady && onReady(null);
      return;
    }

    console.log("[NDOG] [3/3] Authenticated user detected. Starting provisioning...");
    console.log("[NDOG] User UID:", fbUser.uid);
    console.log("[NDOG] User email:", fbUser.email);

    // Set up a single real-time listener for this user's data
    const userRef = ref(db, `users/${fbUser.uid}`);
    let firstLoad = true;

    onValue(userRef, async (snap) => {
      console.log("[NDOG] [3/3] User data snapshot received");
      
      if (!snap.exists()) {
        console.log("[NDOG] User record doesn't exist yet - provisioning...");
        try {
          const newUser = await provisionUserLocked(fbUser);
          console.log("[NDOG] ✅ User provisioned successfully");
          emit(newUser);
          if (firstLoad) {
            onReady && onReady(newUser);
            firstLoad = false;
          }
        } catch (err) {
          console.error("[NDOG] ❌ Provisioning failed:", err);
          emit(null);
        }
        return;
      }

      const data = snap.val();
      console.log("[NDOG] User data loaded:", { uid: data.uid, name: data.name, balance: data.balance });
      
      if (data.banned) {
        console.log("[NDOG] ⚠️ User is banned");
        document.getElementById("bannedModal")?.classList.remove("hidden");
        return;
      }

      console.log("[NDOG] ✅ User authentication complete - emitting user data");
      emit(data);
      
      if (firstLoad) {
        onReady && onReady(data);
        firstLoad = false;
      }
    }, (err) => {
      console.error("[NDOG] ❌ User data listener error:", err);
      emit(null);
    });
  });

  console.log("[NDOG] === AUTH INITIALIZATION COMPLETE ===");
}
