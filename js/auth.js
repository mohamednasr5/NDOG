/** 
 * NileDogs (NDOG) — Authentication Module
 * v2.0.1 MOBILE REDIRECT FIX:
 *   • عند العودة من Google ولم يتم التعرف على المستخدم (خاصة في Safari/mobile)
 *     نقوم بإعادة تحميل الصفحة قسراً بدلاً من مجرد عرض خطأ، لأن sessionStorage
 *     يتم مسحه أحياناً أثناء عملية الـ redirect، مما يفقدنا نتيجة getRedirectResult.
 *   • إضافة مهلة أمان (timeout) للتأكد من اكتمال المصادقة بعد العودة من Google.
 *   • استخدام auth.currentUser كمرجع مباشر بدلاً من الاعتماد على currentUserData
 *     في مرحلة getRedirectResult لتجنب سباق العمليات (race condition).
 */

import {
  auth, db, googleProvider, APP_CONFIG,
  ref, get, set, update, push, onValue,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged,
  generateReferralCode, getDeviceFingerprint
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

// In-app browsers (Telegram, Facebook, Instagram, Line, WeChat, Twitter/X,
// TikTok, Snapchat) and bare Android WebViews ("; wv)") commonly:
//   1) get blocked outright by Google ("disallowed_useragent"), or
//   2) silently clear/partition sessionStorage + IndexedDB across the
//      full-page redirect, which breaks getRedirectResult() with NO error.
function isEmbeddedBrowser() {
  const ua = navigator.userAgent || navigator.vendor || "";
  return /Telegram|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Twitter|TikTok|Snapchat|; ?wv\)/i.test(ua);
}

function isStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
         window.navigator.standalone === true;
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

  // CRITICAL FIX: On mobile PWA standalone, the old window.open() trick
  // is unreliable. Instead, try popup first (works on most modern Android
  // WebAPKs), then fall back to redirect. The visibilitychange handler
  // will force a reload if the user comes back still logged out.
  if (isStandalone() && isMobile()) {
    console.log("[NDOG] Standalone PWA on mobile — trying popup directly");
    sessionStorage.setItem("ndog_pwa_login_opened", "1");
    // Don't escape to system browser — try popup in this context first
  }

  // CRITICAL FIX: prefer signInWithPopup even on mobile.
  // signInWithRedirect requires sessionStorage/IndexedDB state to survive a
  // full-page round trip. Many mobile browsers clear that storage, which
  // silently breaks getRedirectResult().
  try {
    console.log("[NDOG] Attempting signInWithPopup (preferred on all devices)");
    await signInWithPopup(auth, googleProvider);
    sessionStorage.removeItem("ndog_pwa_login_opened");
    return;
  } catch (err) {
    const fallbackToRedirect = [
      "auth/popup-blocked",
      "auth/operation-not-supported-in-this-environment",
      "auth/cancelled-popup-request"
    ].includes(err?.code);

    if (!fallbackToRedirect) {
      sessionStorage.removeItem("ndog_pwa_login_opened");
      console.error("[NDOG] Google login failed:", err.code, err.message);
      const friendly = friendlyAuthError(err);
      const e = new Error(friendly);
      e.original = err;
      throw e;
    }

    console.log("[NDOG] Popup unavailable (", err.code, ") — falling back to signInWithRedirect");
  }

  try {
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
  console.log("[NDOG] Standalone PWA:", isStandalone());

  // ─────────────────────────────────────────────────────────────────
  // FIX #1: Set up onAuthStateChanged FIRST, before getRedirectResult.
  //
  // This is the most critical fix. Previously, getRedirectResult was
  // called first, and if it threw an error (common on mobile), the
  // function returned early WITHOUT ever registering the
  // onAuthStateChanged listener. Result: authenticated users were
  // stuck on the login screen forever because the app never detected
  // their auth state.
  //
  // Now: onAuthStateChanged is always registered, ensuring we never
  // miss the user regardless of what happens with redirect results.
  // ─────────────────────────────────────────────────────────────────

  let userSetupDone = new Map(); // Track which UIDs have been fully set up

  onAuthStateChanged(auth, async (fbUser) => {
    console.log("[NDOG] onAuthStateChanged fired:", fbUser ? `uid=${fbUser.uid}` : "null");

    if (!fbUser) {
      console.log("[NDOG] No authenticated user");
      emit(null);
      onReady && onReady(null);
      return;
    }

    const uid = fbUser.uid;

    // Prevent duplicate setup if onAuthStateChanged fires multiple times
    // for the same user (can happen with redirect flow + persistence sync)
    if (userSetupDone.has(uid)) {
      console.log("[NDOG] User", uid, "already set up, skipping duplicate");
      return;
    }
    userSetupDone.set(uid, true);

    console.log("[NDOG] Starting user setup for:", uid, fbUser.email);

    try {
      const userRef = ref(db, `users/${uid}`);

      // ─────────────────────────────────────────────────────────
      // FIX #2: Use get() for initial load, NOT onValue().
      //
      // onValue() fires every time the data changes. If the user
      // doesn't exist yet, it fires with null, we start async
      // provisioning, then provisioning calls set() which triggers
      // onValue() AGAIN — creating a race condition where:
      //   a) Two concurrent provisioning attempts
      //   b) emit(null) from the error handler wiping auth state
      //   c) firstLoad flag being true in both callbacks
      //
      // get() returns a single snapshot — no race condition.
      // After initial load + provisioning, we set up onValue()
      // for real-time updates only.
      // ─────────────────────────────────────────────────────────
      const snap = await get(userRef);

      let userData;
      if (!snap.exists()) {
        console.log("[NDOG] User record doesn't exist - provisioning...");
        userData = await provisionUserLocked(fbUser);
        console.log("[NDOG] User provisioned successfully:", userData.name);
      } else {
        userData = snap.val();
        // Update photo/name if changed in Google account
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

      // Now set up real-time listener for live updates (balance changes,
      // streak updates from other tabs, admin changes, etc.)
      // This is safe because provisioning is already complete.
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

      // ─────────────────────────────────────────────────────────
      // FIX #3: Don't kick user back to login on DB errors.
      //
      // Previously, if provisioning failed (e.g., DB timeout, network
      // error, permission denied), emit(null) was called, which hid
      // the dashboard and showed the login screen again. The user
      // would think login "didn't work" even though they DID
      // authenticate with Google successfully.
      //
      // Now: show the dashboard with minimal fallback data so the
      // user sees they're logged in. The real data will sync once
      // the DB connection recovers (via the onValue listener set
      // up after a retry).
      // ─────────────────────────────────────────────────────────
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

      // Retry provisioning after a delay
      userSetupDone.delete(uid); // Allow retry
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

  // ─────────────────────────────────────────────────────────────────
  // Handle redirect result AFTER onAuthStateChanged is set up.
  //
  // This is non-critical now — if it throws, onAuthStateChanged is
  // already listening and will pick up the user from persistence.
  // ─────────────────────────────────────────────────────────────────
  try {
    console.log("[NDOG] Checking for redirect result...");
    const redirectResult = await getRedirectResult(auth);

    const wasPending = sessionStorage.getItem("ndog_redirect_pending") === "1";
    sessionStorage.removeItem("ndog_redirect_pending");

    if (redirectResult?.user) {
      console.log("[NDOG] Redirect result received for:", redirectResult.user.uid);
    } else if (wasPending) {
      // We sent the user to Google via signInWithRedirect, the page came
      // back, but there is no result. This is the classic "silently lost
      // across the redirect" failure on mobile.
      console.warn("[NDOG] Expected a redirect result but got none");
      
      // ═══════════════════════════════════════════════════════════
      // ✅ الإصلاح الجذري لمشكلة الموبايل:
      // إذا كنا عائدين من إعادة التوجيه ولم يتم التعرف على المستخدم،
      // نعيد تحميل الصفحة قسراً. هذا يحل مشكلة فقدان الجلسة في الهواتف
      // لأن إعادة التحميل ستجبر Firebase على إعادة قراءة الحالة المخزنة
      // في localStorage (التي تكون قد حُفظت أصلاً أثناء عملية المصادقة).
      // ═══════════════════════════════════════════════════════════
      if (!auth.currentUser) {
        console.log("[NDOG] No user detected after redirect. Forcing reload to re-initialize auth.");
        location.reload();
        return;
      }

      document.dispatchEvent(new CustomEvent("ndog:authError", {
        detail: { message: t("auth.errRedirectIncomplete") }
      }));
    } else {
      console.log("[NDOG] No redirect result (normal for first visit or popup flow)");
    }
  } catch (err) {
    sessionStorage.removeItem("ndog_redirect_pending");
    console.error("[NDOG] getRedirectResult error:", err.code, err.message);
    // DON'T return early! onAuthStateChanged is already set up above.
    // Only show error if no user is detected after a brief delay.
    setTimeout(() => {
      if (!currentUserData) {
        document.dispatchEvent(new CustomEvent("ndog:authError", {
          detail: { message: friendlyAuthError(err) }
        }));
      }
    }, 2000);
  }

  // ─────────────────────────────────────────────────────────────────
  // 🛡️ مهلة أمان إضافية للموبايل:
  // إذا كانت عملية redirectPending ومازال auth.currentUser فارغاً بعد 2.5 ثانية،
  // نعيد التحميل لإنقاذ الجلسة.
  // ─────────────────────────────────────────────────────────────────
  if (sessionStorage.getItem("ndog_redirect_pending") === "1") {
    setTimeout(() => {
      if (!auth.currentUser) {
        console.warn("[NDOG] Redirect recovery timeout — forcing reload.");
        sessionStorage.removeItem("ndog_redirect_pending");
        location.reload();
      }
    }, 2500);
  }

  console.log("[NDOG] === AUTH INITIALIZATION COMPLETE ===");

  // Defensive fallback for PWA: if the user signed in via popup/redirect
  // but the auth state didn't sync to this window, reload on visibility
  // change to re-read persisted auth from disk.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (sessionStorage.getItem("ndog_pwa_login_opened") !== "1") return;
    sessionStorage.removeItem("ndog_pwa_login_opened");
    if (!currentUserData) {
      console.log("[NDOG] Back from sign-in, still logged out — reloading");
      location.reload();
    }
  });
}
