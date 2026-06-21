/**
 * NileDogs (NDOG) — Database Helper Module
 * ------------------------------------------
 * Provides all CRUD operations against Firebase Realtime Database.
 * Depends on `window.NDOG.db` being set by firebase.js.
 *
 * Conventions:
 *   - Async functions return the written value or null on error.
 *   - Listener functions (on-value) accept a callback(dataSnapshot) and
 *     return an unsubscribe function that calls `.off()`.
 *   - Errors are logged to console and swallowed so the UI never crashes.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Internal helpers                                                    */
  /* ------------------------------------------------------------------ */

  function db() {
    return window.NDOG.db;
  }

  function ref(path) {
    return db().ref(path);
  }

  function logError(context, err) {
    console.error('[NDOG.DB] ' + context + ':', err.message || err);
  }

  /* ------------------------------------------------------------------ */
  /*  USER OPERATIONS                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Create a brand-new user profile under /users/{uid}.
   * @param {string} uid
   * @param {object} data – flat object to merge (displayName, email, photoURL, etc.)
   * @returns {Promise<object|null>}
   */
  async function createUserProfile(uid, data) {
    try {
      var profile = Object.assign(
        {
          balance: 0,
          totalClaimed: 0,
          totalEarned: 0,
          referralCode: '',
          referredBy: null,
          referralCount: 0,
          referralEarnings: 0,
          country: '',
          scores: 0,
          rank: 'Bronze',
          claimCount: 0,
          spinCount: 0,
          luckyBoxCount: 0,
          createdAt: window.firebase.database.ServerValue.TIMESTAMP,
          lastLogin: window.firebase.database.ServerValue.TIMESTAMP,
          isBanned: false,
          banReason: '',
        },
        data
      );
      await ref('users/' + uid).set(profile);
      return profile;
    } catch (err) {
      logError('createUserProfile', err);
      return null;
    }
  }

  /**
   * Listen to a user profile in real time.
   * @param {string} uid
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getUserProfile(uid, callback) {
    var r = ref('users/' + uid);
    var handler = r.on('value', callback, function (err) {
      logError('getUserProfile listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Partially update a user profile.
   * @param {string} uid
   * @param {object} updates
   * @returns {Promise<object|null>}
   */
  async function updateUserProfile(uid, updates) {
    try {
      await ref('users/' + uid).update(updates);
      return updates;
    } catch (err) {
      logError('updateUserProfile', err);
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  CLAIM OPERATIONS                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Append a claim record under /claims/{uid}.
   * @param {string} uid
   * @param {object} claimData – { amount, source, ... }
   * @returns {Promise<string|null>} push key or null
   */
  async function addClaim(uid, claimData) {
    try {
      var claimRef = ref('claims/' + uid).push();
      var payload = Object.assign(
        {
          amount: 0,
          source: 'daily',
          timestamp: window.firebase.database.ServerValue.TIMESTAMP,
        },
        claimData
      );
      await claimRef.set(payload);
      return claimRef.key;
    } catch (err) {
      logError('addClaim', err);
      return null;
    }
  }

  /**
   * Listen to last 50 claims for a user.
   * @param {string} uid
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getClaims(uid, callback) {
    var r = ref('claims/' + uid).orderByChild('timestamp').limitToLast(50);
    var handler = r.on('value', callback, function (err) {
      logError('getClaims listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Get the most recent claim for a user (single-value read).
   * @param {string} uid
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getLastClaim(uid, callback) {
    var r = ref('claims/' + uid).orderByChild('timestamp').limitToLast(1);
    var handler = r.on('value', callback, function (err) {
      logError('getLastClaim listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /* ------------------------------------------------------------------ */
  /*  REFERRAL OPERATIONS                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Listen to referral summary for a user.
   * @param {string} uid
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getReferralData(uid, callback) {
    var r = ref('referrals/' + uid);
    var handler = r.on('value', callback, function (err) {
      logError('getReferralData listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Log a single referral event under /referralLogs/{code}.
   * @param {string} code  – referral code
   * @param {string} referredUid
   * @param {number} level – 1, 2, or 3
   * @returns {Promise<boolean>}
   */
  async function addReferralLog(code, referredUid, level) {
    try {
      await ref('referralLogs/' + code).push({
        referredUid: referredUid,
        level: level,
        timestamp: window.firebase.database.ServerValue.TIMESTAMP,
        reward: level === 1 ? 50 : level === 2 ? 20 : 10,
      });
      return true;
    } catch (err) {
      logError('addReferralLog', err);
      return false;
    }
  }

  /**
   * Process a 3-level referral chain.
   *
   * 1. Find the referrer profile via /users (ordered by referralCode).
   * 2. Give L1 reward (50 NDOG) to the direct referrer.
   * 3. If referrer was referred by someone, give L2 reward (20 NDOG).
   * 4. If that user was also referred, give L3 reward (10 NDOG).
   * 5. Update balances atomically via Firebase transactions.
   * 6. Log each referral level.
   *
   * @param {string} referrerUid – the direct referrer's UID
   * @param {string} referredUid – the newly signed-up user's UID
   * @param {string} code        – the referral code used
   * @returns {Promise<boolean>}
   */
  async function processReferral(referrerUid, referredUid, code) {
    try {
      // Level 1 — direct referrer
      var referrerSnap = await ref('users/' + referrerUid).once('value');
      var referrer = referrerSnap.val();
      if (!referrer) return false;

      // Reward L1: 50 NDOG
      await ref('users/' + referrerUid + '/balance').transaction(function (
        current
      ) {
        return (current || 0) + 50;
      });
      await ref(
        'users/' + referrerUid + '/referralEarnings'
      ).transaction(function (current) {
        return (current || 0) + 50;
      });
      await addReferralLog(code, referredUid, 1);
      await ref('users/' + referrerUid + '/referralCount').transaction(
        function (current) {
          return (current || 0) + 1;
        }
      );

      // Level 2 — referrer's referrer
      if (referrer.referredBy) {
        var l2Snap = await ref('users/' + referrer.referredBy).once('value');
        var l2User = l2Snap.val();
        if (l2User) {
          await ref(
            'users/' + referrer.referredBy + '/balance'
          ).transaction(function (current) {
            return (current || 0) + 20;
          });
          await ref(
            'users/' + referrer.referredBy + '/referralEarnings'
          ).transaction(function (current) {
            return (current || 0) + 20;
          });
          await addReferralLog(code, referredUid, 2);
        }

        // Level 3 — grand-referrer
        if (l2User && l2User.referredBy) {
          var l3Snap = await ref('users/' + l2User.referredBy).once('value');
          var l3User = l3Snap.val();
          if (l3User) {
            await ref(
              'users/' + l2User.referredBy + '/balance'
            ).transaction(function (current) {
              return (current || 0) + 10;
            });
            await ref(
              'users/' + l2User.referredBy + '/referralEarnings'
            ).transaction(function (current) {
              return (current || 0) + 10;
            });
            await addReferralLog(code, referredUid, 3);
          }
        }
      }

      return true;
    } catch (err) {
      logError('processReferral', err);
      return false;
    }
  }

  /**
   * Recount referrals for a user and update the referralCount field.
   * @param {string} uid
   * @returns {Promise<boolean>}
   */
  async function updateReferralCounts(uid) {
    try {
      var snap = await ref('users')
        .orderByChild('referredBy')
        .equalTo(uid)
        .once('value');
      var count = snap.numChildren();
      await ref('users/' + uid + '/referralCount').set(count);
      return true;
    } catch (err) {
      logError('updateReferralCounts', err);
      return false;
    }
  }

  /**
   * Listen to the referral tree for a user (all users they referred directly).
   * @param {string} uid
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getReferralTree(uid, callback) {
    var r = ref('users').orderByChild('referredBy').equalTo(uid);
    var handler = r.on('value', callback, function (err) {
      logError('getReferralTree listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /* ------------------------------------------------------------------ */
  /*  MISSIONS OPERATIONS                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Listen to a user's mission progress.
   * @param {string} uid
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getMissions(uid, callback) {
    var r = ref('userMissions/' + uid);
    var handler = r.on('value', callback, function (err) {
      logError('getMissions listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Partially update a specific mission's progress.
   * @param {string} uid
   * @param {string} missionId
   * @param {object} updates
   * @returns {Promise<boolean>}
   */
  async function updateMission(uid, missionId, updates) {
    try {
      await ref('userMissions/' + uid + '/' + missionId).update(updates);
      return true;
    } catch (err) {
      logError('updateMission', err);
      return false;
    }
  }

  /**
   * Listen to global mission definitions from /missionDefinitions.
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getMissionDefinitions(callback) {
    var r = ref('missionDefinitions');
    var handler = r.on('value', callback, function (err) {
      logError('getMissionDefinitions listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /* ------------------------------------------------------------------ */
  /*  LEADERBOARD OPERATIONS                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Listen to a leaderboard.
   * @param {string} type      – 'global', 'country', 'referral'
   * @param {string} [country] – required when type === 'country'
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getLeaderboard(type, country, callback) {
    // Normalise arguments: (type, callback) or (type, country, callback)
    if (typeof country === 'function') {
      callback = country;
      country = null;
    }

    var r;
    if (type === 'country' && country) {
      r = ref('leaderboard')
        .orderByChild('country')
        .equalTo(country)
        .limitToLast(50);
    } else if (type === 'referral') {
      r = ref('leaderboard')
        .orderByChild('referralCount')
        .limitToLast(50);
    } else {
      // global — order by balance
      r = ref('leaderboard').orderByChild('balance').limitToLast(50);
    }

    var handler = r.on('value', callback, function (err) {
      logError('getLeaderboard listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Upsert the current user's entry in /leaderboard/{uid}.
   * @param {string} uid
   * @param {object} data – { displayName, balance, country, referralCount, avatar }
   * @returns {Promise<boolean>}
   */
  async function updateLeaderboard(uid, data) {
    try {
      await ref('leaderboard/' + uid).update(
        Object.assign(
          {
            displayName: '',
            balance: 0,
            country: '',
            referralCount: 0,
            avatar: '',
            updatedAt: window.firebase.database.ServerValue.TIMESTAMP,
          },
          data
        )
      );
      return true;
    } catch (err) {
      logError('updateLeaderboard', err);
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  STAKING OPERATIONS                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Listen to a user's stakes.
   * @param {string} uid
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getStakes(uid, callback) {
    var r = ref('stakes/' + uid);
    var handler = r.on('value', callback, function (err) {
      logError('getStakes listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Create a new staking position.
   * @param {string} uid
   * @param {object} stakeData – { amount, duration, apy, ... }
   * @returns {Promise<string|null>} push key
   */
  async function addStake(uid, stakeData) {
    try {
      var stakeRef = ref('stakes/' + uid).push();
      var payload = Object.assign(
        {
          amount: 0,
          duration: 30,
          apy: 5,
          reward: 0,
          status: 'active',
          createdAt: window.firebase.database.ServerValue.TIMESTAMP,
          endsAt: window.firebase.database.ServerValue.TIMESTAMP,
        },
        stakeData
      );
      await stakeRef.set(payload);
      return stakeRef.key;
    } catch (err) {
      logError('addStake', err);
      return null;
    }
  }

  /**
   * Update a specific stake.
   * @param {string} uid
   * @param {string} stakeId
   * @param {object} updates
   * @returns {Promise<boolean>}
   */
  async function updateStake(uid, stakeId, updates) {
    try {
      await ref('stakes/' + uid + '/' + stakeId).update(updates);
      return true;
    } catch (err) {
      logError('updateStake', err);
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  AIRDROP OPERATIONS                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Listen to a user's airdrop task progress.
   * @param {string} uid
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getAirdropTasks(uid, callback) {
    var r = ref('userAirdrop/' + uid);
    var handler = r.on('value', callback, function (err) {
      logError('getAirdropTasks listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Mark an airdrop task as completed and credit the reward.
   * @param {string} uid
   * @param {string} taskId
   * @returns {Promise<boolean>}
   */
  async function completeAirdropTask(uid, taskId) {
    try {
      // Get task definition to know the reward
      var taskDefSnap = await ref(
        'airdropDefinitions/' + taskId
      ).once('value');
      var taskDef = taskDefSnap.val();
      var reward = taskDef ? taskDef.reward || 0 : 0;

      await ref('userAirdrop/' + uid + '/' + taskId).update({
        completed: true,
        completedAt: window.firebase.database.ServerValue.TIMESTAMP,
        reward: reward,
      });

      // Credit reward to balance
      if (reward > 0) {
        await ref('users/' + uid + '/balance').transaction(function (
          current
        ) {
          return (current || 0) + reward;
        });
      }

      return true;
    } catch (err) {
      logError('completeAirdropTask', err);
      return false;
    }
  }

  /**
   * Listen to global airdrop task definitions.
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getAirdropDefinitions(callback) {
    var r = ref('airdropDefinitions');
    var handler = r.on('value', callback, function (err) {
      logError('getAirdropDefinitions listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /* ------------------------------------------------------------------ */
  /*  NEWS OPERATIONS                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Listen to news articles (last 20).
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getNews(callback) {
    var r = ref('news').orderByChild('createdAt').limitToLast(20);
    var handler = r.on('value', callback, function (err) {
      logError('getNews listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Add a new news article.
   * @param {object} newsData – { title, body, image, ... }
   * @returns {Promise<string|null>} push key
   */
  async function addNews(newsData) {
    try {
      var newsRef = ref('news').push();
      var payload = Object.assign(
        {
          title: '',
          body: '',
          image: '',
          createdAt: window.firebase.database.ServerValue.TIMESTAMP,
        },
        newsData
      );
      await newsRef.set(payload);
      return newsRef.key;
    } catch (err) {
      logError('addNews', err);
      return null;
    }
  }

  /**
   * Delete a news article.
   * @param {string} newsId
   * @returns {Promise<boolean>}
   */
  async function deleteNews(newsId) {
    try {
      await ref('news/' + newsId).remove();
      return true;
    } catch (err) {
      logError('deleteNews', err);
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  ADMIN OPERATIONS                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Check if a user has an admin role.
   * @param {string} uid
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getAdminRole(uid, callback) {
    var r = ref('admins/' + uid);
    var handler = r.on('value', callback, function (err) {
      logError('getAdminRole listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Listen to all users (paginated — first 100 ordered by createdAt).
   * @param {function} callback(snapshot)
   * @param {number} [limit=100]
   * @returns {function} unsubscribe
   */
  function getAllUsers(callback, limit) {
    var lim = limit || 100;
    var r = ref('users').orderByChild('createdAt').limitToLast(lim);
    var handler = r.on('value', callback, function (err) {
      logError('getAllUsers listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Ban a user.
   * @param {string} uid
   * @param {string} reason
   * @returns {Promise<boolean>}
   */
  async function banUser(uid, reason) {
    try {
      await ref('bannedUsers/' + uid).set({
        reason: reason || 'Violation of terms',
        bannedAt: window.firebase.database.ServerValue.TIMESTAMP,
        bannedBy: window.NDOG.currentUser ? window.NDOG.currentUser.uid : '',
      });
      await ref('users/' + uid + '/isBanned').set(true);
      await ref('users/' + uid + '/banReason').set(reason || '');
      return true;
    } catch (err) {
      logError('banUser', err);
      return false;
    }
  }

  /**
   * Unban a user.
   * @param {string} uid
   * @returns {Promise<boolean>}
   */
  async function unbanUser(uid) {
    try {
      await ref('bannedUsers/' + uid).remove();
      await ref('users/' + uid + '/isBanned').set(false);
      await ref('users/' + uid + '/banReason').set('');
      return true;
    } catch (err) {
      logError('unbanUser', err);
      return false;
    }
  }

  /**
   * Set a user's balance to an exact value (admin action).
   * @param {string} uid
   * @param {number} newBalance
   * @returns {Promise<boolean>}
   */
  async function editUserBalance(uid, newBalance) {
    try {
      await ref('users/' + uid + '/balance').set(newBalance);
      return true;
    } catch (err) {
      logError('editUserBalance', err);
      return false;
    }
  }

  /**
   * Set a user's rank (admin action).
   * @param {string} uid
   * @param {string} newRank
   * @returns {Promise<boolean>}
   */
  async function editUserRank(uid, newRank) {
    try {
      await ref('users/' + uid + '/rank').set(newRank);
      return true;
    } catch (err) {
      logError('editUserRank', err);
      return false;
    }
  }

  /**
   * Listen to fraud logs.
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getFraudLogs(callback) {
    var r = ref('fraudLogs').orderByChild('timestamp').limitToLast(100);
    var handler = r.on('value', callback, function (err) {
      logError('getFraudLogs listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Listen to analytics data.
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getAnalytics(callback) {
    var r = ref('analytics');
    var handler = r.on('value', callback, function (err) {
      logError('getAnalytics listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /* ------------------------------------------------------------------ */
  /*  DEVICE FINGERPRINT                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Check whether a fingerprint hash is already associated with a *different* UID.
   * @param {string} fp
   * @param {string} uid
   * @returns {Promise<object|null>} existing record or null
   */
  async function checkFingerprint(fp, uid) {
    try {
      var snap = await ref('fingerprints/' + fp).once('value');
      var data = snap.val();
      if (!data) return null;
      if (data.uid && data.uid !== uid) {
        return data; // duplicate detected
      }
      return null;
    } catch (err) {
      logError('checkFingerprint', err);
      return null;
    }
  }

  /**
   * Store a device fingerprint mapping.
   * @param {string} fp
   * @param {string} uid
   * @returns {Promise<boolean>}
   */
  async function storeFingerprint(fp, uid) {
    try {
      await ref('fingerprints/' + fp).set({
        uid: uid,
        timestamp: window.firebase.database.ServerValue.TIMESTAMP,
      });
      return true;
    } catch (err) {
      logError('storeFingerprint', err);
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  FLAGGED ACCOUNTS                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Flag an account for review.
   * @param {string} uid
   * @param {string} reason
   * @param {object} details
   * @returns {Promise<boolean>}
   */
  async function flagAccount(uid, reason, details) {
    try {
      await ref('flaggedAccounts/' + uid).set({
        reason: reason,
        details: details || {},
        flaggedAt: window.firebase.database.ServerValue.TIMESTAMP,
        flaggedBy: window.NDOG.currentUser ? window.NDOG.currentUser.uid : '',
        resolved: false,
      });
      return true;
    } catch (err) {
      logError('flagAccount', err);
      return false;
    }
  }

  /**
   * Listen to flagged accounts.
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getFlaggedAccounts(callback) {
    var r = ref('flaggedAccounts').orderByChild('flaggedAt').limitToLast(100);
    var handler = r.on('value', callback, function (err) {
      logError('getFlaggedAccounts listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /* ------------------------------------------------------------------ */
  /*  TRANSACTIONS                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Append a transaction record under /transactions/{uid}.
   * @param {string} uid
   * @param {object} txData – { type, amount, description, ... }
   * @returns {Promise<string|null>} push key
   */
  async function addTransaction(uid, txData) {
    try {
      var txRef = ref('transactions/' + uid).push();
      var payload = Object.assign(
        {
          type: 'credit',
          amount: 0,
          description: '',
          timestamp: window.firebase.database.ServerValue.TIMESTAMP,
        },
        txData
      );
      await txRef.set(payload);
      return txRef.key;
    } catch (err) {
      logError('addTransaction', err);
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  NOTIFICATIONS                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Listen to a user's notifications.
   * @param {string} uid
   * @param {function} callback(snapshot)
   * @returns {function} unsubscribe
   */
  function getNotifications(uid, callback) {
    var r = ref('notifications/' + uid)
      .orderByChild('timestamp')
      .limitToLast(30);
    var handler = r.on('value', callback, function (err) {
      logError('getNotifications listener', err);
    });
    return function () {
      r.off('value', handler);
    };
  }

  /**
   * Push a notification for a user.
   * @param {string} uid
   * @param {object} notifData – { title, body, type, ... }
   * @returns {Promise<string|null>} push key
   */
  async function addNotification(uid, notifData) {
    try {
      var notifRef = ref('notifications/' + uid).push();
      var payload = Object.assign(
        {
          title: '',
          body: '',
          type: 'info',
          read: false,
          timestamp: window.firebase.database.ServerValue.TIMESTAMP,
        },
        notifData
      );
      await notifRef.set(payload);
      return notifRef.key;
    } catch (err) {
      logError('addNotification', err);
      return null;
    }
  }

  /**
   * Mark a single notification as read.
   * @param {string} uid
   * @param {string} notifId
   * @returns {Promise<boolean>}
   */
  async function markNotificationRead(uid, notifId) {
    try {
      await ref('notifications/' + uid + '/' + notifId + '/read').set(true);
      return true;
    } catch (err) {
      logError('markNotificationRead', err);
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  UTILITY                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Generate a unique referral code: "NDOG" + 5 random uppercase alphanumeric chars.
   * @returns {string}
   */
  function generateReferralCode() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var code = 'NDOG';
    for (var i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Return the Firebase server timestamp sentinel.
   * @returns {object}
   */
  function getTimestamp() {
    return window.firebase.database.ServerValue.TIMESTAMP;
  }

  /* ------------------------------------------------------------------ */
  /*  Expose to global namespace                                          */
  /* ------------------------------------------------------------------ */

  window.NDOG = window.NDOG || {};
  window.NDOG.DB = {
    // User
    createUserProfile: createUserProfile,
    getUserProfile: getUserProfile,
    updateUserProfile: updateUserProfile,
    // Claim
    addClaim: addClaim,
    getClaims: getClaims,
    getLastClaim: getLastClaim,
    // Referral
    getReferralData: getReferralData,
    addReferralLog: addReferralLog,
    processReferral: processReferral,
    updateReferralCounts: updateReferralCounts,
    getReferralTree: getReferralTree,
    // Missions
    getMissions: getMissions,
    updateMission: updateMission,
    getMissionDefinitions: getMissionDefinitions,
    // Leaderboard
    getLeaderboard: getLeaderboard,
    updateLeaderboard: updateLeaderboard,
    // Staking
    getStakes: getStakes,
    addStake: addStake,
    updateStake: updateStake,
    // Airdrop
    getAirdropTasks: getAirdropTasks,
    completeAirdropTask: completeAirdropTask,
    getAirdropDefinitions: getAirdropDefinitions,
    // News
    getNews: getNews,
    addNews: addNews,
    deleteNews: deleteNews,
    // Admin
    getAdminRole: getAdminRole,
    getAllUsers: getAllUsers,
    banUser: banUser,
    unbanUser: unbanUser,
    editUserBalance: editUserBalance,
    editUserRank: editUserRank,
    getFraudLogs: getFraudLogs,
    getAnalytics: getAnalytics,
    // Fingerprint
    checkFingerprint: checkFingerprint,
    storeFingerprint: storeFingerprint,
    // Flagged
    flagAccount: flagAccount,
    getFlaggedAccounts: getFlaggedAccounts,
    // Transactions
    addTransaction: addTransaction,
    // Notifications
    getNotifications: getNotifications,
    addNotification: addNotification,
    markNotificationRead: markNotificationRead,
    // Utility
    generateReferralCode: generateReferralCode,
    getTimestamp: getTimestamp,
  };
})();