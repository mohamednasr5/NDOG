/**
 * NileDogs (NDOG) — Internationalization (i18n) Module
 * ------------------------------------------------------------------
 * Bilingual support for Arabic (ar) and English (en), with full RTL
 * layout switching. Language choice is persisted in localStorage.
 *
 * Public API:
 *   - t(key, vars?)           → translate a key (with {var} substitution)
 *   - getLang() / setLang(l)  → get / set current language ("en" | "ar")
 *   - toggleLang()            → flip en ↔ ar
 *   - applyTranslations(root?) → scan DOM for [data-i18n] / [data-i18n-html]
 *                                 attributes and apply current language
 *   - onLangChange(cb)        → subscribe to language changes
 *
 * Two HTML attributes are supported:
 *   data-i18n="key"           → sets element.textContent (HTML escaped)
 *   data-i18n-html="key"      → sets element.innerHTML (allows <strong> etc.)
 *
 * For dynamic strings in JS, import { t } from "./i18n.js" and call
 * t("claim.btn") etc.
 */

const STORAGE_KEY = "ndog_lang";
export const SUPPORTED_LANGS = ["en", "ar"];
export const DEFAULT_LANG = detectInitialLang();

function detectInitialLang() {
  // 1. localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  } catch (_) {}
  // 2. URL ?lang=
  try {
    const url = new URLSearchParams(location.search).get("lang");
    if (url && SUPPORTED_LANGS.includes(url)) return url;
  } catch (_) {}
  // 3. Browser language
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("ar")) return "ar";
  // 4. Default
  return "en";
}

let currentLang = DEFAULT_LANG;
const listeners = new Set();

// ───────────────────────────────────────────────────────────────────
// Translation dictionaries
// ───────────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    "common.copy": "Copy",
    "common.copied": "Copied to clipboard",

    "login.googleBtn": "Continue with Google",
    "login.tagline": "Join the early adopter program. Earn tokens, invite friends, and become a founder before the official launch on <strong>January 1, 2028</strong>.",
    "login.note": "By continuing you agree to the <a href=\"./whitepaper-en.html\">Whitepaper</a> and confirm you are 13+.",
    "login.feat1": "Daily NDOG rewards",
    "login.feat2": "3-tier referral bonuses",
    "login.feat3": "Global leaderboard",
    "login.feat4": "Missions & spin wheel",
    "login.connecting": "Connecting…",
    "login.connectFailed": "Google login failed. Try again.",

    "cd.days": "Days",
    "cd.hrs": "Hrs",
    "cd.min": "Min",
    "cd.sec": "Sec",

    "nav.dashboard": "Dashboard",
    "nav.claim": "Daily Claim",
    "nav.referral": "Referrals",
    "nav.missions": "Missions",
    "nav.leaderboard": "Leaderboard",
    "nav.whitepaper": "Whitepaper",
    "nav.admin": "Admin",
    "nav.logout": "Sign Out",

    "bn.home": "Home",
    "bn.claim": "Claim",
    "bn.refer": "Refer",
    "bn.missions": "Missions",
    "bn.ranks": "Ranks",

    "dash.hello": "Welcome back,",
    "dash.memberSince": "Member since {date}",
    "dash.claimToday": "Claim Today",
    "dash.balance": "Balance",
    "dash.community": "Community Score",
    "dash.loyalty": "Loyalty Score",
    "dash.referrals": "Referrals",
    "dash.points": "points",
    "dash.invited": "invited",
    "dash.refLink": "Your Referral Link",
    "dash.rewardLevel": "Reward Level",
    "dash.founderBadge": "Founder Badge Unlocked",
    "dash.founderDesc": "You joined before launch — you receive priority rewards and a higher reward multiplier forever.",
    "dash.maxLevel": "Max level reached 👑",
    "dash.nextLevel": "Next: {name} ({remaining} NDOG to go)",
    "dash.level.bronze": "Bronze",
    "dash.level.silver": "Silver",
    "dash.level.gold": "Gold",
    "dash.level.diamond": "Diamond",
    "dash.level.legend": "Legend",

    "claim.ready": "Ready to claim",
    "claim.btn": "Claim Daily Reward",
    "claim.btnClaiming": "Claiming…",
    "claim.btnClaimed": "Claimed ✓ — Come back later",
    "claim.btnClaimedShort": "Claimed ✓",
    "claim.streakLabel": "🔥 Streak:",
    "claim.streakDays": "{n} days",
    "claim.levels": "Reward Levels",
    "claim.history": "Claim History",
    "claim.emptyHistory": "No claims yet — claim your first reward today!",
    "claim.alreadyClaimed": "You already claimed today. Come back later!",
    "claim.success": "🎉 You claimed {n} NDOG! (×{m})",
    "claim.failed": "Claim failed — please try again.",
    "claim.loadingHistory": "Loading history…",
    "claim.nextIn": "Next claim in",

    "claim.boostMining": "⛏️ Boost Mining",
    "claim.boostMiningDesc": "Watch an ad to boost your mining power!",

    "ref.title": "Invite & Earn Big",
    "ref.intro": "Share your link. Earn NDOG across <strong>3 levels</strong> of referrals — forever.",
    "ref.total": "Total Referrals",
    "ref.active": "Active Referrals",
    "ref.earn": "Referral Earnings",
    "ref.conv": "Conversion Rate",
    "ref.codeLabel": "Your Referral Code",
    "ref.linkLabel": "Your Referral Link",
    "ref.network": "Referral Network",
    "ref.empty": "No referrals yet — share your link to grow your network.",
    "ref.loading": "Loading…",
    "ref.anonymous": "Anonymous",
    "ref.joined": "Joined {date} · {country}",
    "ref.shareText": "🐕 Join me on NileDogs (NDOG)! Use my referral link to earn bonus NDOG tokens and become a founder before launch on Jan 1, 2028. 🚀",

    "missions.daily": "Daily",
    "missions.weekly": "Weekly",
    "missions.monthly": "Monthly",
    "missions.badges": "Badges",
    "missions.events": "Events",
    "missions.miniGames": "Mini Games",
    "missions.spin": "Spin Wheel",
    "missions.spinSub": "Free daily spin",
    "missions.lucky": "Lucky Box",
    "missions.luckySub": "Open every 6h",
    "missions.signInFirst": "Sign in to view your missions.",
    "missions.unlocked": "Unlocked",
    "missions.locked": "Locked",
    "missions.done": "Done",
    "missions.go": "Go",
    "missions.shareHint": "Share your referral link to complete this mission!",
    "missions.autoTracked": "This mission is automatically tracked.",
    "missions.spinDone": "You already spun today. Come back tomorrow!",
    "missions.spinning": "Spinning…",
    "missions.spinAgain": "Spin Again",
    "missions.spinWon": "🎉 You won {n} NDOG!",
    "missions.spinNoLuck": "Better luck next time! 🎡",
    "missions.spinFailed": "Spin recorded but reward failed. Contact support.",
    "missions.luckyRecharge": "Lucky box recharges in {h}h {m}m",
    "missions.openBox": "Open Box",
    "missions.opened": "Opened ✓",
    "missions.luckyWon": "🎉 You found {n} NDOG in the lucky box!",

    "mission.d1.title": "Claim Daily Reward",
    "mission.d1.desc": "Claim your daily NDOG",
    "mission.d2.title": "Share Referral Link",
    "mission.d2.desc": "Share on social media",
    "mission.d3.title": "Spin the Wheel",
    "mission.d3.desc": "One free daily spin",
    "mission.d4.title": "Open Lucky Box",
    "mission.d4.desc": "Open a mystery box",
    "mission.d5.title": "Check Leaderboard",
    "mission.d5.desc": "Visit the leaderboard",
    "mission.w1.title": "7-Day Streak",
    "mission.w1.desc": "Claim 7 days in a row",
    "mission.w2.title": "Invite 3 Friends",
    "mission.w2.desc": "Get 3 new referrals",
    "mission.w3.title": "Reach 500 NDOG",
    "mission.w3.desc": "Grow your balance",
    "mission.m1.title": "Founder Status",
    "mission.m1.desc": "Be a pre-launch member",
    "mission.m2.title": "Reach Gold Rank",
    "mission.m2.desc": "Earn 2,000+ NDOG",
    "mission.m3.title": "Top 100 Globally",
    "mission.m3.desc": "Climb the leaderboard",
    "mission.b1.title": "Founder",
    "mission.b1.desc": "Joined before launch",
    "mission.b2.title": "Streak Master",
    "mission.b2.desc": "30-day claim streak",
    "mission.b3.title": "Network Builder",
    "mission.b3.desc": "10+ referrals",
    "mission.b4.title": "Gold Member",
    "mission.b4.desc": "Reach Gold tier",
    "mission.b5.title": "Diamond Hands",
    "mission.b5.desc": "Reach Diamond tier",
    "mission.b6.title": "Legend",
    "mission.b6.desc": "Reach Legend tier",
    "mission.e1.title": "Launch Countdown Event",
    "mission.e1.desc": "Join the global launch party on Jan 1, 2028",
    "mission.e2.title": "Community Challenge: 1M Referrals",
    "mission.e2.desc": "Help the community reach 1M total referrals",
    "mission.e3.title": "Weekly Lucky Draw",
    "mission.e3.desc": "Top 10 referrers each week share 5000 NDOG",

    "lb.global": "🌍 Global",
    "lb.country": "🏳️ Country",
    "lb.referral": "👥 Referral",
    "lb.loading": "Loading…",
    "lb.noData": "No data yet.",
    "lb.anonymous": "Anonymous",
    "lb.globalLabel": "Global",

    "wp.title": "NileDogs Whitepaper",
    "wp.subtitle": "Read the full vision, tokenomics, and roadmap.",
    "wp.en": "English Whitepaper",
    "wp.ar": "النسخة العربية",
    "wp.quickTitle": "Quick Highlights",
    "wp.q1": "<strong>Launch:</strong> January 1, 2028 — mainnet activation.",
    "wp.q2": "<strong>Early Adopter Program:</strong> Founder Badge + 1.5× reward multiplier for life.",
    "wp.q3": "<strong>Distribution:</strong> 60% community, 15% team (4y vest), 10% liquidity, 10% partnerships, 5% reserve.",
    "wp.q4": "<strong>Referral Rewards:</strong> 3-tier system (L1: 50, L2: 20, L3: 10 NDOG).",
    "wp.q5": "<strong>Anti-Fraud:</strong> Device fingerprint + rate limiting + admin review.",

    "modal.qrTitle": "Scan to Join",
    "modal.qrHint": "Point your camera at the QR code to start earning NDOG.",
    "modal.spinTitle": "Daily Spin Wheel",
    "modal.spinNow": "Spin Now",
    "modal.spinHint": "One free spin every 24 hours.",
    "modal.luckyTitle": "Lucky Box",
    "modal.luckyOpen": "Open Box",
    "modal.luckyHint": "Mystery reward between 5 and 100 NDOG.",
    "modal.bannedTitle": "Account Suspended",
    "modal.bannedDesc": "Your account has been suspended for violating community rules. Contact support if you believe this is a mistake.",

    "auth.errUnauthorizedDomain": "This domain is not authorized in Firebase. Add it in Firebase Console → Authentication → Settings → Authorized domains.",
    "auth.errPopupClosed": "Sign-in popup was closed before completing. Please try again.",
    "auth.errPopupBlocked": "Popup was blocked by the browser. Allow popups for this site and try again.",
    "auth.errNotEnabled": "Google sign-in is not enabled in your Firebase project. Enable it in Firebase Console → Authentication → Sign-in method.",
    "auth.errNetwork": "Network error during sign-in. Check your connection and try again.",
    "auth.errRedirectPending": "A redirect sign-in is already in progress. Please wait.",
    "auth.errEnv": "Sign-in is not supported in this environment. Please use a modern browser over HTTPS.",
    "auth.errGeneric": "Sign-in failed. Please try again.",

    "admin.loginTitle": "Admin Access",
    "admin.loginDesc": "Sign in with an authorized admin Google account.",
    "admin.loginBtn": "Sign in as Admin",
    "admin.backToApp": "← Back to app",
    "admin.denyTitle": "Access Denied",
    "admin.denyDesc": "Your account is not authorized to view the admin dashboard. If you believe this is an error, ask a super-admin to add your UID to the admins node in the Realtime Database.",
    "admin.brand": "NDOG Admin",
    "admin.signOut": "Sign Out",
    "admin.nav.overview": "Overview",
    "admin.nav.users": "Users",
    "admin.nav.referrals": "Referrals",
    "admin.nav.claims": "Claims",
    "admin.nav.gifts": "Gifts",
    "admin.nav.tasks": "Tasks",
    "admin.nav.notifications": "Notifications",
    "admin.nav.events": "Events",
    "admin.nav.leaderboards": "Leaderboards",
    "admin.nav.analytics": "Analytics",
    "admin.nav.export": "Export",
    "admin.nav.backToApp": "Back to App",

    "admin.kpi.totalUsers": "Total Users",
    "admin.kpi.active24h": "Active 24h",
    "admin.kpi.claimsToday": "Claims Today",
    "admin.kpi.totalSupply": "Total NDOG",
    "admin.kpi.referrals": "Referrals",
    "admin.kpi.founders": "Founders",
    "admin.kpi.banned": "Banned",
    "admin.kpi.avgBalance": "Avg Balance",
    "admin.sub.allTime": "all time",
    "admin.sub.last24h": "last 24 hours",
    "admin.sub.dailyClaims": "daily claims",
    "admin.sub.circulating": "circulating",
    "admin.sub.totalTracked": "total tracked",
    "admin.sub.preLaunch": "pre-launch users",
    "admin.sub.suspended": "suspended",
    "admin.sub.perUser": "NDOG per user",
    "admin.recentUsers": "Recent Users",
    "admin.th.name": "Name",
    "admin.th.email": "Email",
    "admin.th.country": "Country",
    "admin.th.balance": "Balance",
    "admin.th.joined": "Joined",
    "admin.th.user": "User",
    "admin.th.code": "Code",
    "admin.th.refs": "Refs",
    "admin.th.status": "Status",
    "admin.th.actions": "Actions",
    "admin.th.referrer": "Referrer",
    "admin.th.referredUser": "Referred User",
    "admin.th.level": "Level",
    "admin.th.date": "Date",
    "admin.th.userId": "User ID",
    "admin.th.type": "Type",
    "admin.th.amount": "Amount",
    "admin.th.title": "Title",
    "admin.th.reward": "Reward",
    "admin.th.message": "Message",
    "admin.th.rank": "#",

    "admin.search.placeholder": "Search by name, email, code, country…",
    "admin.filter.all": "All users",
    "admin.filter.founder": "Founders only",
    "admin.filter.banned": "Banned only",
    "admin.filter.active": "Active 24h",

    "admin.pill.banned": "Banned",
    "admin.pill.active": "Active",
    "admin.pill.founder": "Founder",

    "admin.action.edit": "Edit",
    "admin.action.addReward": "+Rwd",
    "admin.action.subReward": "−Rwd",
    "admin.action.ban": "Ban",
    "admin.action.unban": "Unban",
    "admin.action.delete": "Del",
    "admin.action.deleteFull": "Delete",
    "admin.action.send": "Send",
    "admin.action.create": "Create",

    "admin.allReferrals": "All Referrals",
    "admin.allClaims": "All Claims (auto daily/mission claims)",
    "admin.noClaims": "No claims yet.",
    "admin.noReferrals": "No referrals yet.",

    "admin.gifts.sendTitle": "Send a Gift",
    "admin.gifts.sendDesc": "Manually grant NDOG to one user or broadcast a gift to everyone.",
    "admin.gifts.targetPlaceholder": "User email, UID or referral code (leave empty to send to ALL users)",
    "admin.gifts.amountPlaceholder": "Gift amount (NDOG)",
    "admin.gifts.reasonPlaceholder": "Reason / note (optional)",
    "admin.gifts.sendBtn": "🎁 Send Gift",
    "admin.gifts.historyTitle": "Gift History",
    "admin.gifts.noGifts": "No gifts sent yet.",
    "admin.gifts.th.target": "Recipient",
    "admin.gifts.th.reason": "Reason",
    "admin.gifts.all": "All Users (broadcast)",
    "admin.gifts.userNotFound": "No user matches that email / UID / code",
    "admin.gifts.amountRequired": "Enter a valid gift amount",
    "admin.gifts.sentOne": "Gift of {amount} NDOG sent to {name}",
    "admin.gifts.sentAll": "Gift of {amount} NDOG sent to all {count} users",
    "admin.gifts.confirmDelete": "Delete this gift record? (this does NOT reclaim the NDOG already credited)",
    "admin.gifts.deleted": "Gift record deleted",

    "admin.tasks.createTitle": "Create Task",
    "admin.tasks.titlePlaceholder": "Task title",
    "admin.tasks.descPlaceholder": "Description",
    "admin.tasks.rewardPlaceholder": "Reward (NDOG)",
    "admin.tasks.existingTitle": "Existing Tasks",
    "admin.tasks.daily": "Daily",
    "admin.tasks.weekly": "Weekly",
    "admin.tasks.monthly": "Monthly",
    "admin.tasks.noTasks": "No tasks yet.",
    "admin.tasks.titleReq": "Title and reward required",
    "admin.tasks.created": "Task created",
    "admin.tasks.deleted": "Task deleted",

    "admin.notif.sendTitle": "Send Notification",
    "admin.notif.titlePlaceholder": "Title",
    "admin.notif.messagePlaceholder": "Message",
    "admin.notif.sendBtn": "Send to All Users",
    "admin.notif.recentTitle": "Recent Notifications",
    "admin.notif.noNotifs": "No notifications yet.",
    "admin.notif.titleReq": "Title and message required",
    "admin.notif.sent": "Notification sent to all users",

    "admin.events.createTitle": "Create Event",
    "admin.events.titlePlaceholder": "Event title",
    "admin.events.descPlaceholder": "Description",
    "admin.events.rewardPlaceholder": "Reward",
    "admin.events.activeTitle": "Active Events",
    "admin.events.statusActive": "Active",
    "admin.events.statusUpcoming": "Upcoming",
    "admin.events.statusEnded": "Ended",
    "admin.events.noEvents": "No events yet.",
    "admin.events.titleReq": "Title required",
    "admin.events.created": "Event created",
    "admin.events.deleted": "Event deleted",

    "admin.lb.title": "Top 50 by Balance",

    "admin.analytics.dau": "DAU (24h)",
    "admin.analytics.ret7": "Retention 7d",
    "admin.analytics.refGrowth": "Referral Growth",
    "admin.analytics.avgClaim": "Avg Claim",
    "admin.analytics.chartTitle": "Daily Claims (last 14 days)",

    "admin.export.title": "Export Data",
    "admin.export.desc": "Download a CSV of all data for offline analysis.",
    "admin.export.users": "📥 Export Users CSV",
    "admin.export.claims": "📥 Export Claims CSV",
    "admin.export.referrals": "📥 Export Referrals CSV",
    "admin.export.gifts": "📥 Export Gifts CSV",
    "admin.export.ready": "Export ready",

    "admin.modal.editUser": "Edit User",
    "admin.modal.namePlaceholder": "Name",
    "admin.modal.balancePlaceholder": "Balance",
    "admin.modal.countryPlaceholder": "Country",
    "admin.modal.scorePlaceholder": "Community score",
    "admin.modal.save": "Save",
    "admin.modal.cancel": "Cancel",

    "admin.toast.loginFailed": "Login failed",
    "admin.toast.userUpdated": "User updated",
    "admin.toast.rewardApplied": "{delta} NDOG applied",
    "admin.toast.unbanned": "User unbanned",
    "admin.toast.banned": "User banned",
    "admin.toast.deleted": "User deleted",
    "admin.confirm.deleteUser": "Permanently delete this user? This cannot be undone."
  },

  ar: {
    "common.copy": "نسخ",
    "common.copied": "تم النسخ إلى الحافظة",

    "login.googleBtn": "المتابعة باستخدام Google",
    "login.tagline": "انضم إلى برنامج المتبنّي المبكر. اكسب الرموز، ادعُ أصدقاءك، وكن مؤسساً قبل الإطلاق الرسمي في <strong>1 يناير 2028</strong>.",
    "login.note": "بالمتابعة أنت توافق على <a href=\"./whitepaper-ar.html\">الورقة البيضاء</a> وتؤكد أن عمرك 13+.",
    "login.feat1": "مكافآت NDOG يومية",
    "login.feat2": "مكافآت إحالة من 3 طبقات",
    "login.feat3": "لوحة متصدرين عالمية",
    "login.feat4": "مهام وعجلة دوران",
    "login.connecting": "جارٍ الاتصال…",
    "login.connectFailed": "فشل تسجيل الدخول بـ Google. حاول مرة أخرى.",

    "cd.days": "أيام",
    "cd.hrs": "ساعة",
    "cd.min": "دقيقة",
    "cd.sec": "ثانية",

    "nav.dashboard": "الرئيسية",
    "nav.claim": "المطالبة اليومية",
    "nav.referral": "الإحالات",
    "nav.missions": "المهام",
    "nav.leaderboard": "المتصدرون",
    "nav.whitepaper": "الورقة البيضاء",
    "nav.admin": "الإدارة",
    "nav.logout": "تسجيل الخروج",

    "bn.home": "الرئيسية",
    "bn.claim": "مطالبة",
    "bn.refer": "إحالة",
    "bn.missions": "مهام",
    "bn.ranks": "المراكز",

    "dash.hello": "مرحباً بعودتك،",
    "dash.memberSince": "عضو منذ {date}",
    "dash.claimToday": "اطلب اليوم",
    "dash.balance": "الرصيد",
    "dash.community": "نقاط المجتمع",
    "dash.loyalty": "نقاط الولاء",
    "dash.referrals": "الإحالات",
    "dash.points": "نقطة",
    "dash.invited": "مدعو",
    "dash.refLink": "رابط الإحالة الخاص بك",
    "dash.rewardLevel": "مستوى المكافآت",
    "dash.founderBadge": "تم فتح شارة المؤسس",
    "dash.founderDesc": "لقد انضممت قبل الإطلاق — تحصل على مكافآت أولوية ومضاعف مكافآت أعلى للأبد.",
    "dash.maxLevel": "وصلت أعلى مستوى 👑",
    "dash.nextLevel": "التالي: {name} (يتبقى {remaining} NDOG)",
    "dash.level.bronze": "برونز",
    "dash.level.silver": "فضة",
    "dash.level.gold": "ذهب",
    "dash.level.diamond": "ماسة",
    "dash.level.legend": "أسطورة",

    "claim.ready": "جاهز للمطالبة",
    "claim.btn": "اطلب مكافأة اليوم",
    "claim.btnClaiming": "جارٍ المطالبة…",
    "claim.btnClaimed": "تمت المطالبة ✓ — عُد لاحقاً",
    "claim.btnClaimedShort": "تمت المطالبة ✓",
    "claim.streakLabel": "🔥 السلسلة:",
    "claim.streakDays": "{n} يوم",
    "claim.levels": "مستويات المكافآت",
    "claim.history": "سجل المطالبات",
    "claim.emptyHistory": "لا توجد مطالبات بعد — اطلب أول مكافأة اليوم!",
    "claim.alreadyClaimed": "لقد طالبت اليوم بالفعل. عُد لاحقاً!",
    "claim.success": "🎉 لقد طلبت {n} NDOG! (×{m})",
    "claim.failed": "فشلت المطالبة — حاول مرة أخرى.",
    "claim.loadingHistory": "جارٍ تحميل السجل…",
    "claim.nextIn": "المطالبة التالية خلال",

    "claim.boostMining": "⛏️ زيادة التعدين",
    "claim.boostMiningDesc": "شاهد إعلاناً لزيادة قوة التعدين!",

    "ref.title": "ادعُ واربح أكثر",
    "ref.intro": "شارك رابطك. اكسب NDOG عبر <strong>3 مستويات</strong> من الإحالات — للأبد.",
    "ref.total": "إجمالي الإحالات",
    "ref.active": "الإحالات النشطة",
    "ref.earn": "أرباح الإحالات",
    "ref.conv": "معدل التحويل",
    "ref.codeLabel": "رمز الإحالة الخاص بك",
    "ref.linkLabel": "رابط الإحالة الخاص بك",
    "ref.network": "شبكة الإحالات",
    "ref.empty": "لا توجد إحالات بعد — شارك رابطك لتنمية شبكتك.",
    "ref.loading": "جارٍ التحميل…",
    "ref.anonymous": "مجهول",
    "ref.joined": "انضم في {date} · {country}",
    "ref.shareText": "🐕 انضم إليّ على NileDogs (NDOG)! استخدم رابط الإحالة الخاص بي لربح NDOG إضافي وكن مؤسساً قبل الإطلاق في 1 يناير 2028. 🚀",

    "missions.daily": "يومي",
    "missions.weekly": "أسبوعي",
    "missions.monthly": "شهري",
    "missions.badges": "الشارات",
    "missions.events": "الفعاليات",
    "missions.miniGames": "ألعاب مصغّرة",
    "missions.spin": "عجلة الدوران",
    "missions.spinSub": "دوران يومي مجاني",
    "missions.lucky": "الصندوق المحظوظ",
    "missions.luckySub": "افتح كل 6 ساعات",
    "missions.signInFirst": "سجّل الدخول لعرض مهامك.",
    "missions.unlocked": "مفتوحة",
    "missions.locked": "مقفلة",
    "missions.done": "تم",
    "missions.go": "اذهب",
    "missions.shareHint": "شارك رابط الإحالة لإكمال هذه المهمة!",
    "missions.autoTracked": "هذه المهمة تُتابع تلقائياً.",
    "missions.spinDone": "لقد دورت اليوم بالفعل. عُد غداً!",
    "missions.spinning": "جارٍ الدوران…",
    "missions.spinAgain": "دوران مرة أخرى",
    "missions.spinWon": "🎉 لقد ربحت {n} NDOG!",
    "missions.spinNoLuck": "حظاً أوفر في المرة القادمة! 🎡",
    "missions.spinFailed": "تم تسجيل الدوران لكن فشل منح المكافأة. تواصل مع الدعم.",
    "missions.luckyRecharge": "الصندوق المحظوظ يُشحن خلال {h}س {m}د",
    "missions.openBox": "افتح الصندوق",
    "missions.opened": "مفتوح ✓",
    "missions.luckyWon": "🎉 لقد وجدت {n} NDOG في الصندوق المحظوظ!",

    "mission.d1.title": "اطلب المكافأة اليومية",
    "mission.d1.desc": "اطلب NDOG اليومي",
    "mission.d2.title": "شارك رابط الإحالة",
    "mission.d2.desc": "شارك على وسائل التواصل",
    "mission.d3.title": "دور العجلة",
    "mission.d3.desc": "دوران يومي مجاني",
    "mission.d4.title": "افتح الصندوق المحظوظ",
    "mission.d4.desc": "افتح صندوقاً غامضاً",
    "mission.d5.title": "تحقق من المتصدرين",
    "mission.d5.desc": "زر لوحة المتصدرين",
    "mission.w1.title": "سلسلة 7 أيام",
    "mission.w1.desc": "اطلب 7 أيام متتالية",
    "mission.w2.title": "ادعُ 3 أصدقاء",
    "mission.w2.desc": "احصل على 3 إحالات جديدة",
    "mission.w3.title": "اصل إلى 500 NDOG",
    "mission.w3.desc": "نمِّ رصيدك",
    "mission.m1.title": "حالة المؤسس",
    "mission.m1.desc": "كن عضواً قبل الإطلاق",
    "mission.m2.title": "اصل إلى الرتبة الذهبية",
    "mission.m2.desc": "اكسب 2000+ NDOG",
    "mission.m3.title": "ضمن أعلى 100 عالمياً",
    "mission.m3.desc": "تسلّق لوحة المتصدرين",
    "mission.b1.title": "المؤسس",
    "mission.b1.desc": "انضم قبل الإطلاق",
    "mission.b2.title": "سيد السلاسل",
    "mission.b2.desc": "سلسلة مطالبة 30 يوماً",
    "mission.b3.title": "باني الشبكة",
    "mission.b3.desc": "10+ إحالات",
    "mission.b4.title": "عضو ذهبي",
    "mission.b4.desc": "اصل للمستوى الذهبي",
    "mission.b5.title": "أيدٍ ماسية",
    "mission.b5.desc": "اصل للمستوى الماسي",
    "mission.b6.title": "أسطورة",
    "mission.b6.desc": "اصل لمستوى الأسطورة",
    "mission.e1.title": "فعالية عدّ الإطلاق",
    "mission.e1.desc": "انضم إلى حفلة الإطلاق العالمية في 1 يناير 2028",
    "mission.e2.title": "تحدّي المجتمع: مليون إحالة",
    "mission.e2.desc": "ساعد المجتمع في الوصول إلى مليون إحالة إجمالية",
    "mission.e3.title": "السحب الأسبوعي المحظوظ",
    "mission.e3.desc": "أعلى 10 مُحيلين كل أسبوع يقتسمون 5000 NDOG",

    "lb.global": "🌍 عالمي",
    "lb.country": "🏳️ البلد",
    "lb.referral": "👥 الإحالة",
    "lb.loading": "جارٍ التحميل…",
    "lb.noData": "لا توجد بيانات بعد.",
    "lb.anonymous": "مجهول",
    "lb.globalLabel": "عالمي",

    "wp.title": "ورقة NileDogs البيضاء",
    "wp.subtitle": "اقرأ الرؤية الكاملة، واقتصاد الرمز، وخارطة الطريق.",
    "wp.en": "الورقة الإنجليزية",
    "wp.ar": "النسخة العربية",
    "wp.quickTitle": "أبرز النقاط",
    "wp.q1": "<strong>الإطلاق:</strong> 1 يناير 2028 — تفعيل الشبكة الرئيسية.",
    "wp.q2": "<strong>برنامج المتبنّي المبكر:</strong> شارة المؤسس + مضاعف مكافآت 1.5× مدى الحياة.",
    "wp.q3": "<strong>التوزيع:</strong> 60% مجتمع، 15% فريق (استحقاق 4 سنوات)، 10% سيولة، 10% شراكات، 5% احتياطي.",
    "wp.q4": "<strong>مكافآت الإحالة:</strong> نظام 3 طبقات (L1: 50، L2: 20، L3: 10 NDOG).",
    "wp.q5": "<strong>مكافحة الاحتيال:</strong> بصمة الجهاز + تقييد المعدلات + مراجعة المسؤول.",

    "modal.qrTitle": "امسح للانضمام",
    "modal.qrHint": "وجّه كاميرتك إلى رمز QR لبدء كسب NDOG.",
    "modal.spinTitle": "عجلة الدوران اليومية",
    "modal.spinNow": "دور الآن",
    "modal.spinHint": "دوران مجاني واحد كل 24 ساعة.",
    "modal.luckyTitle": "الصندوق المحظوظ",
    "modal.luckyOpen": "افتح الصندوق",
    "modal.luckyHint": "مكافأة غامضة بين 5 و100 NDOG.",
    "modal.bannedTitle": "تم تعليق الحساب",
    "modal.bannedDesc": "تم تعليق حسابك لانتهاك قواعد المجتمع. تواصل مع الدعم إذا كنت تعتقد أن هذا خطأ.",

    "auth.errUnauthorizedDomain": "هذا النطاق غير مُصرّح به في Firebase. أضفه من Firebase Console → Authentication → Settings → Authorized domains.",
    "auth.errPopupClosed": "أُغلقت نافذة تسجيل الدخول قبل إكمالها. حاول مرة أخرى.",
    "auth.errPopupBlocked": "حظر المتصفح النافذة المنبثقة. اسمح بالنوافذ المنبثقة لهذا الموقع وحاول مرة أخرى.",
    "auth.errNotEnabled": "تسجيل الدخول بـ Google غير مُفعّل في مشروع Firebase. فعّله من Firebase Console → Authentication → Sign-in method.",
    "auth.errNetwork": "خطأ شبكة أثناء تسجيل الدخول. تحقق من اتصالك وحاول مرة أخرى.",
    "auth.errRedirectPending": "تسجيل دخول بالفعل قيد التقدم. يرجى الانتظار.",
    "auth.errEnv": "تسجيل الدخول غير مدعوم في هذه البيئة. استخدم متصفحاً حديثاً عبر HTTPS.",
    "auth.errGeneric": "فشل تسجيل الدخول. حاول مرة أخرى.",

    "admin.loginTitle": "دخول الإدارة",
    "admin.loginDesc": "سجّل الدخول بحساب Google إداري مُصرّح له.",
    "admin.loginBtn": "تسجيل الدخول كمسؤول",
    "admin.backToApp": "← رجوع إلى التطبيق",
    "admin.denyTitle": "تم رفض الوصول",
    "admin.denyDesc": "حسابك غير مُصرّح له بعرض لوحة تحكم الإدارة. إذا كنت تعتقد أن هذا خطأ، اطلب من مسؤول أعلى إضافة UID حسابك إلى عنصر admins في قاعدة البيانات.",
    "admin.brand": "إدارة NDOG",
    "admin.signOut": "تسجيل الخروج",
    "admin.nav.overview": "نظرة عامة",
    "admin.nav.users": "المستخدمون",
    "admin.nav.referrals": "الإحالات",
    "admin.nav.claims": "المطالبات",
    "admin.nav.gifts": "الهدايا",
    "admin.nav.tasks": "المهام",
    "admin.nav.notifications": "الإشعارات",
    "admin.nav.events": "الفعاليات",
    "admin.nav.leaderboards": "المتصدرون",
    "admin.nav.analytics": "التحليلات",
    "admin.nav.export": "تصدير",
    "admin.nav.backToApp": "رجوع إلى التطبيق",

    "admin.kpi.totalUsers": "إجمالي المستخدمين",
    "admin.kpi.active24h": "نشط خلال 24 ساعة",
    "admin.kpi.claimsToday": "مطالبات اليوم",
    "admin.kpi.totalSupply": "إجمالي NDOG",
    "admin.kpi.referrals": "الإحالات",
    "admin.kpi.founders": "المؤسسون",
    "admin.kpi.banned": "محظورون",
    "admin.kpi.avgBalance": "متوسط الرصيد",
    "admin.sub.allTime": "كل الأوقات",
    "admin.sub.last24h": "آخر 24 ساعة",
    "admin.sub.dailyClaims": "مطالبات يومية",
    "admin.sub.circulating": "متداول",
    "admin.sub.totalTracked": "إجمالي المتابَع",
    "admin.sub.preLaunch": "مستخدمو ما قبل الإطلاق",
    "admin.sub.suspended": "موقوفون",
    "admin.sub.perUser": "NDOG لكل مستخدم",
    "admin.recentUsers": "أحدث المستخدمين",
    "admin.th.name": "الاسم",
    "admin.th.email": "البريد الإلكتروني",
    "admin.th.country": "الدولة",
    "admin.th.balance": "الرصيد",
    "admin.th.joined": "تاريخ الانضمام",
    "admin.th.user": "المستخدم",
    "admin.th.code": "الكود",
    "admin.th.refs": "الإحالات",
    "admin.th.status": "الحالة",
    "admin.th.actions": "إجراءات",
    "admin.th.referrer": "المُحيل",
    "admin.th.referredUser": "المستخدم المُحال",
    "admin.th.level": "المستوى",
    "admin.th.date": "التاريخ",
    "admin.th.userId": "معرّف المستخدم",
    "admin.th.type": "النوع",
    "admin.th.amount": "المبلغ",
    "admin.th.title": "العنوان",
    "admin.th.reward": "المكافأة",
    "admin.th.message": "الرسالة",
    "admin.th.rank": "#",

    "admin.search.placeholder": "بحث بالاسم، البريد، الكود، الدولة…",
    "admin.filter.all": "كل المستخدمين",
    "admin.filter.founder": "المؤسسون فقط",
    "admin.filter.banned": "المحظورون فقط",
    "admin.filter.active": "نشط خلال 24 ساعة",

    "admin.pill.banned": "محظور",
    "admin.pill.active": "نشط",
    "admin.pill.founder": "مؤسس",

    "admin.action.edit": "تعديل",
    "admin.action.addReward": "+مكافأة",
    "admin.action.subReward": "−مكافأة",
    "admin.action.ban": "حظر",
    "admin.action.unban": "إلغاء الحظر",
    "admin.action.delete": "حذف",
    "admin.action.deleteFull": "حذف",
    "admin.action.send": "إرسال",
    "admin.action.create": "إنشاء",

    "admin.allReferrals": "جميع الإحالات",
    "admin.allClaims": "جميع المطالبات (مطالبات يومية/مهام تلقائية)",
    "admin.noClaims": "لا توجد مطالبات بعد.",
    "admin.noReferrals": "لا توجد إحالات بعد.",

    "admin.gifts.sendTitle": "إرسال هدية",
    "admin.gifts.sendDesc": "منح NDOG يدوياً لمستخدم واحد أو إرسال هدية جماعية لجميع المستخدمين.",
    "admin.gifts.targetPlaceholder": "بريد المستخدم أو UID أو كود الإحالة (اتركه فارغاً للإرسال لجميع المستخدمين)",
    "admin.gifts.amountPlaceholder": "قيمة الهدية (NDOG)",
    "admin.gifts.reasonPlaceholder": "السبب / ملاحظة (اختياري)",
    "admin.gifts.sendBtn": "🎁 إرسال الهدية",
    "admin.gifts.historyTitle": "سجل الهدايا",
    "admin.gifts.noGifts": "لم تُرسل أي هدايا بعد.",
    "admin.gifts.th.target": "المستلم",
    "admin.gifts.th.reason": "السبب",
    "admin.gifts.all": "جميع المستخدمين (جماعي)",
    "admin.gifts.userNotFound": "لا يوجد مستخدم مطابق لهذا البريد / UID / الكود",
    "admin.gifts.amountRequired": "أدخل قيمة هدية صحيحة",
    "admin.gifts.sentOne": "تم إرسال هدية {amount} NDOG إلى {name}",
    "admin.gifts.sentAll": "تم إرسال هدية {amount} NDOG إلى جميع المستخدمين ({count})",
    "admin.gifts.confirmDelete": "حذف سجل هذه الهدية؟ (هذا لا يسترجع NDOG التي تم إضافتها مسبقاً)",
    "admin.gifts.deleted": "تم حذف سجل الهدية",

    "admin.tasks.createTitle": "إنشاء مهمة",
    "admin.tasks.titlePlaceholder": "عنوان المهمة",
    "admin.tasks.descPlaceholder": "الوصف",
    "admin.tasks.rewardPlaceholder": "المكافأة (NDOG)",
    "admin.tasks.existingTitle": "المهام الحالية",
    "admin.tasks.daily": "يومية",
    "admin.tasks.weekly": "أسبوعية",
    "admin.tasks.monthly": "شهرية",
    "admin.tasks.noTasks": "لا توجد مهام بعد.",
    "admin.tasks.titleReq": "العنوان والمكافأة مطلوبان",
    "admin.tasks.created": "تم إنشاء المهمة",
    "admin.tasks.deleted": "تم حذف المهمة",

    "admin.notif.sendTitle": "إرسال إشعار",
    "admin.notif.titlePlaceholder": "العنوان",
    "admin.notif.messagePlaceholder": "الرسالة",
    "admin.notif.sendBtn": "إرسال لجميع المستخدمين",
    "admin.notif.recentTitle": "أحدث الإشعارات",
    "admin.notif.noNotifs": "لا توجد إشعارات بعد.",
    "admin.notif.titleReq": "العنوان والرسالة مطلوبان",
    "admin.notif.sent": "تم إرسال الإشعار لجميع المستخدمين",

    "admin.events.createTitle": "إنشاء فعالية",
    "admin.events.titlePlaceholder": "عنوان الفعالية",
    "admin.events.descPlaceholder": "الوصف",
    "admin.events.rewardPlaceholder": "المكافأة",
    "admin.events.activeTitle": "الفعاليات النشطة",
    "admin.events.statusActive": "نشطة",
    "admin.events.statusUpcoming": "قادمة",
    "admin.events.statusEnded": "منتهية",
    "admin.events.noEvents": "لا توجد فعاليات بعد.",
    "admin.events.titleReq": "العنوان مطلوب",
    "admin.events.created": "تم إنشاء الفعالية",
    "admin.events.deleted": "تم حذف الفعالية",

    "admin.lb.title": "أفضل 50 بالرصيد",

    "admin.analytics.dau": "المستخدمون النشطون (24 ساعة)",
    "admin.analytics.ret7": "نسبة البقاء 7 أيام",
    "admin.analytics.refGrowth": "نمو الإحالات",
    "admin.analytics.avgClaim": "متوسط المطالبة",
    "admin.analytics.chartTitle": "المطالبات اليومية (آخر 14 يوماً)",

    "admin.export.title": "تصدير البيانات",
    "admin.export.desc": "نزّل ملف CSV لجميع البيانات للتحليل دون اتصال.",
    "admin.export.users": "📥 تصدير المستخدمين CSV",
    "admin.export.claims": "📥 تصدير المطالبات CSV",
    "admin.export.referrals": "📥 تصدير الإحالات CSV",
    "admin.export.gifts": "📥 تصدير الهدايا CSV",
    "admin.export.ready": "التصدير جاهز",

    "admin.modal.editUser": "تعديل المستخدم",
    "admin.modal.namePlaceholder": "الاسم",
    "admin.modal.balancePlaceholder": "الرصيد",
    "admin.modal.countryPlaceholder": "الدولة",
    "admin.modal.scorePlaceholder": "نقاط المجتمع",
    "admin.modal.save": "حفظ",
    "admin.modal.cancel": "إلغاء",

    "admin.toast.loginFailed": "فشل تسجيل الدخول",
    "admin.toast.userUpdated": "تم تحديث المستخدم",
    "admin.toast.rewardApplied": "تم تطبيق {delta} NDOG",
    "admin.toast.unbanned": "تم إلغاء حظر المستخدم",
    "admin.toast.banned": "تم حظر المستخدم",
    "admin.toast.deleted": "تم حذف المستخدم",
    "admin.confirm.deleteUser": "حذف هذا المستخدم نهائياً؟ لا يمكن التراجع عن هذا الإجراء."
  }
};

// ───────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────

/**
 * Translate a key. Supports {var} substitution.
 */
export function t(key, vars) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  let str = dict[key];
  if (str == null) {
    str = TRANSLATIONS.en[key] ?? key;
  }
  if (vars && typeof str === "string") {
    str = str.replace(/\{(\w+)\}/g, (_, name) =>
      (vars[name] != null ? String(vars[name]) : `{${name}}`));
  }
  return str;
}

export function getLang() {
  return currentLang;
}

export function isRTL() {
  return currentLang === "ar";
}

export function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = DEFAULT_LANG;
  if (lang === currentLang) return;
  currentLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}

  document.documentElement.lang = lang;
  document.documentElement.dir = (lang === "ar") ? "rtl" : "ltr";

  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    const href = manifestLink.getAttribute("href").split("?")[0];
    manifestLink.setAttribute("href", href + "?lang=" + lang);
  }

  applyTranslations();

  listeners.forEach(cb => {
    try { cb(lang); } catch (e) { console.error("[i18n] listener error:", e); }
  });
}

export function toggleLang() {
  const next = currentLang === "en" ? "ar" : "en";
  setLang(next);
  return next;
}

export function onLangChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key);
  });
  root.querySelectorAll("[data-i18n-html]").forEach(el => {
    const key = el.getAttribute("data-i18n-html");
    if (!key) return;
    el.innerHTML = t(key);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;
    el.setAttribute("placeholder", t(key));
  });
  root.querySelectorAll("[data-lang]").forEach(el => {
    el.classList.toggle("active", el.getAttribute("data-lang") === currentLang);
  });
}

export function applyHtmlLangDir() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = (currentLang === "ar") ? "rtl" : "ltr";
}

// Apply lang/dir immediately at module load so the very first paint
// is in the correct writing direction (prevents flash of LTR layout
// for Arabic users).
applyHtmlLangDir();