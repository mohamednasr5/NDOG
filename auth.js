/**
 * NileDogs (NDOG) — Authentication Module
 * ------------------------------------------------------------------
 * - Google sign-in (popup with redirect fallback for mobile)
 * - Session persistence (browserLocalPersistence)
 * - User provisioning on first login
 * - Anti-multi-account: device fingerprint check
 * - Banned-account detection
 * - Referral attribution via ?ref= URL param
 */

import {
  auth, db, googleProvider, APP_CONFIG,
  ref, get, set, update, push, onValue,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged,
  generateReferralCode, getDeviceFingerprint
} from "./firebase-config.js";
export { APP_CONFIG };
let currentUserData = null;
let listeners = [];

/** Subscribe to current-user changes. Returns unsubscribe fn. */
export function onUser(cb) {
  listeners.push(cb);
  if (currentUserData) cb(currentUserData);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

function emit(user) {
  currentUserData = user;
  listeners.forEach(l => l(user));
}

export function getCurrentUser() { return currentUserData; }

// ───────────────────────────────────────────────────────────────────
// Detect mobile for proper sign-in flow
// ───────────────────────────────────────────────────────────────────
function isMobile() {
  return /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
}

/**
 * Sign in with Google. Uses popup on desktop, redirect on mobile.
 */
export async function googleLogin() {
  try {
    if (isMobile()) {
      await signInWithRedirect(auth, googleProvider);
      return; // result handled in getRedirectResult below
    }
    const result = await signInWithPopup(auth, googleProvider);
    await provisionUser(result.user);
  } catch (err) {
    const code = err?.code || "";     if (["auth/popup-blocked","auth/popup-closed-by-user","auth/cancelled-popup-request","auth/unauthorized-domain"].includes(code)) {       await signInWithRedirect(auth, googleProvider);       return;     }     console.error("[NDOG] Google login failed:", err);
    throw err;
  }
}

/**
 * Handle redirect result on mobile.
 */
export async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      await provisionUser(result.user);
    }
  } catch (err) {
    console.error("[NDOG] Redirect result failed:", err);
  }
}

/**
 * Sign out.
 */
export async function logout() {
  try {
    await signOut(auth);
    location.reload();
  } catch (err) {
    console.error("[NDOG] Logout failed:", err);
  }
}

// ───────────────────────────────────────────────────────────────────
// Provision user on first login
// ───────────────────────────────────────────────────────────────────
async function provisionUser(firebaseUser) {
  const uid = firebaseUser.uid;
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);

  // Anti-multi-account: check device fingerprint
  const fingerprint = await getDeviceFingerprint();
  const fpRef = ref(db, `deviceFingerprints/${fingerprint}`);
  const fpSnap = await get(fpRef);
  if (fpSnap.exists() && fpSnap.val() !== uid) {
    // Existing fingerprint belongs to a different account → flag for review
    await set(ref(db, `flaggedAccounts/${uid}`), {
      reason: "duplicate_device_fingerprint",
      otherUid: fpSnap.val(),
      at: Date.now()
    });
    // Don't block — let admin review. Continue.
  }
  await set(fpRef, uid);

  if (!snap.exists()) {
    // ── Brand new user: create profile ──
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
      loyaltyScore:   10,        // bonus for joining
      createdAt:    Date.now(),
      lastClaim:    0,
      streak:       0,
      deviceFingerprint: fingerprint,
      banned:       false,
      isFounder:    true,        // everyone joining pre-launch is a founder
      badges:       { founder: true }
    };

    await set(userRef, newUserData);

    // ── Process referral attribution ──
    if (referredBy) {
      await processReferral(uid, referredBy);
    }

    // ── Add to claims history a welcome entry ──
    await push(ref(db, `claims`), {
      userId: uid,
      amount: 0,
      type:   "welcome",
      date:   Date.now()
    });

    console.log("[NDOG] New user provisioned:", name);
    return newUserData;
  }

  // ── Existing user — update profile pic/name if changed ──
  const existing = snap.val();
  const patch = {};
  if (existing.photoURL !== firebaseUser.photoURL) patch.photoURL = firebaseUser.photoURL;
  if (existing.name !== firebaseUser.name && firebaseUser.displayName) patch.name = firebaseUser.displayName;
  if (Object.keys(patch).length) await update(userRef, patch);

  return { ...existing, ...patch };
}

// ───────────────────────────────────────────────────────────────────
// Process referral attribution (3-tier reward)
// ───────────────────────────────────────────────────────────────────
async function processReferral(newUid, refCode) {
  try {
    // Find referrer by referralCode
    const usersSnap = await get(ref(db, "users"));
    if (!usersSnap.exists()) return;

    let referrerUid = null;
    usersSnap.forEach(child => {
      if (child.val().referralCode === refCode) referrerUid = child.key;
    });
    if (!referrerUid || referrerUid === newUid) return;

    const now = Date.now();

    // Create referral record (L1)
    await push(ref(db, "referrals"), {
      referrer:     referrerUid,
      referredUser: newUid,
      level:        1,
      createdAt:    now
    });

    // Reward L1 referrer
    await update(ref(db, `users/${referrerUid}`), {
      balance:        (await bal(referrerUid)) + APP_CONFIG.referralReward.l1,
      totalReferrals: (await tRefs(referrerUid)) + 1,
      communityScore: (await cScore(referrerUid)) + 10
    });

    // L2 — referrer of referrer
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

        // L3 — referrer of L2
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

// ───────────────────────────────────────────────────────────────────
// Auth state observer
// ───────────────────────────────────────────────────────────────────
export function initAuth(onReady) {
  // Handle mobile redirect first
  handleRedirectResult();

  onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) {
      emit(null);
      onReady && onReady(null);
      return;
    }

    // Pull / subscribe to user data
    const userRef = ref(db, `users/${fbUser.uid}`);
    onValue(userRef, (snap) => {
      if (!snap.exists()) {
        // First-time user that hasn't been provisioned yet — try provisioning
        provisionUser(fbUser).then(u => emit(u)).catch(console.error);
        return;
      }
      const data = snap.val();
      // Banned?
      if (data.banned) {
        document.getElementById("bannedModal")?.classList.remove("hidden");
        return;
      }
      emit(data);
      onReady && onReady(data);
    });
  });
}
