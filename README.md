# NileDogs (NDOG) — Complete Project

The Nile's most loyal pack. A complete crypto reward platform built with **pure HTML5 + CSS3 + Vanilla JavaScript ES6 Modules** and **Firebase** backend.

## 🚀 Quick Start

### Option 1: Local development server
```bash
cd ndog/
python3 -m http.server 8080
# Visit http://localhost:8080
```

### Option 2: Deploy to Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

### Option 3: Any static web server (nginx, Apache, Caddy, Vercel, Netlify)
Upload the entire `ndog/` folder to your web root.

## 📦 Project Structure

```
ndog/
├── index.html              # Homepage with hero + dashboard
├── 404.html                # Cinematic 404 (coin falls into Nile)
├── admin.html              # Admin panel (role-gated)
├── airdrop.html            # Airdrop center (TG/X/YT/Web tasks)
├── staking.html            # Staking (30/90/180/365 day plans)
├── leaderboard.html        # 6 leaderboards
├── missions.html           # Missions + mini-games
├── referral.html           # 3-level referral program
├── explorer.html           # Transaction explorer
├── news.html               # News & announcements
├── team.html               # Team page
├── roadmap.html            # Roadmap 2025-2027
├── tokenomics.html         # Tokenomics with charts
├── faq.html                # FAQ accordion
├── contact.html            # Contact form
├── privacy.html            # Privacy policy
├── terms.html              # Terms of service
├── partners.html           # Partners showcase
│
├── css/
│   ├── styles.css          # Design tokens + base
│   ├── responsive.css      # Mobile breakpoints
│   ├── animations.css      # Keyframes + 404 scene
│   ├── darkmode.css        # Theme + RTL
│   ├── dashboard.css       # Dashboard cards
│   ├── referral.css        # Referral tree
│   ├── missions.css        # Mission list
│   ├── staking.css         # Staking plans
│   ├── leaderboard.css     # Leaderboard table
│   └── admin.css           # Admin panel
│
├── js/
│   ├── app.js              # Bootstrap entry point
│   ├── firebase.js         # Firebase init singleton
│   ├── auth.js             # Google auth + One Tap + roles
│   ├── database.js         # Data Access Layer
│   ├── utils.js            # Helpers (DOM, format, crypto)
│   ├── i18n.js             # AR/EN internationalization
│   ├── antifraud.js        # Device FP, VPN, bot, rate-limit
│   ├── analytics.js        # Firebase Analytics wrapper
│   ├── notifications.js    # Browser + realtime notifs
│   ├── dashboard.js        # User dashboard renderer
│   ├── claim.js            # 24h mining claim logic
│   ├── referral.js         # Referral UI + tree
│   ├── missions.js         # Missions renderer
│   ├── staking.js          # Staking contracts
│   ├── airdrop.js          # Airdrop tasks
│   ├── leaderboard.js      # Leaderboard renderer
│   ├── admin.js            # Admin panel controller
│   ├── particles.js        # Canvas particle background
│   ├── charts.js           # Tiny canvas charts
│   └── qr.js               # Pure-JS QR generator
│
├── locales/
│   ├── en.json             # English strings
│   └── ar.json             # Arabic strings
│
├── firebase/
│   ├── database.rules.json # Realtime DB security rules
│   └── storage.rules       # Storage security rules
│
├── pwa/
│   ├── manifest.json       # PWA manifest
│   └── sw.js               # Service Worker (offline + push)
│
├── seo/
│   ├── robots.txt          # Crawler directives
│   └── sitemap.xml         # Sitemap
│
└── assets/                 # Static assets (logos, images, sounds)
    ├── icons/
    ├── images/
    ├── logos/
    ├── backgrounds/
    ├── sounds/
    └── animations/
```

## 🔧 Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Open project `ndog-a3265`
3. **Authentication** → Enable **Google** sign-in provider
4. **Realtime Database** → Rules → Paste content of `firebase/database.rules.json`
5. **Storage** → Rules → Paste content of `firebase/storage.rules`
6. **Add yourself as admin**:
   - Sign in once via the website
   - In Realtime Database, manually add your UID to `/admins/{yourUid}`:
     ```json
     { "role": "admin", "ts": { ".sv": "timestamp" } }
     ```
7. (Optional) **Authorized domains** → Add `ndogcoin.com`, `localhost`, etc.

## 🔒 Security Model

### Authentication
- Google Sign-In (popup + redirect fallback for mobile)
- Google One Tap Login
- Local persistence (survives browser restart)
- 30-min idle timeout
- Role-based access: `user` / `mod` / `admin`

### Anti-Fraud
- Device fingerprint (canvas + WebGL + UA + screen)
- Multi-account detection (fingerprint reuse)
- VPN / proxy / hosting detection (via ipapi.co)
- Bot score (webdriver flag, headless detection)
- Rate limiting per action per user
- Self-referral prevention
- All suspicious events logged to `/fraudLogs`

### Database Rules (database.rules.json)
- Users can only read/write their own profile
- `balance` can only INCREASE from client (admin can decrease)
- `role` / `banned` / `founder` / `vipLevel` are admin-only writes
- Admins verified via `/admins/{uid}` node
- Public-safe fields readable for leaderboards
- All operations logged to `/transactions` and `/adminAuditLog`

## 🎯 Features

### Mining
- 24-hour claim cycle
- Streak bonuses (+2 NDOG/day, capped at 100)
- VIP multipliers (Lv0=1x → Lv5=3x)
- Founder bonus (1.25x)
- Streak milestones (7/14/30/60/100/365 days → bonus)
- Race-safe atomic transactions

### Referrals (3 levels)
- L1: 50 NDOG (direct)
- L2: 20 NDOG (referral of referral)
- L3: 10 NDOG (3rd-level connection)
- Self-referral blocked
- QR code generator for sharing
- Real-time conversion analytics

### Staking (4 plans)
| Plan | APR |
|------|-----|
| 30 days | 12% |
| 90 days | 25% |
| 180 days | 55% |
| 365 days | 120% |

- Min stake: 100 NDOG
- Max stake: 1,000,000 NDOG
- Claim on maturity (principal + rewards)

### Leaderboards (6 boards)
Global · Country · Referral · Weekly · Monthly · All-Time

### Airdrop Center
- Telegram (channel + group)
- Twitter/X (follow + retweet)
- YouTube (subscribe + watch)
- Website visits
- Partner tasks (DB-driven, admin-managed)

### Admin Panel (`/admin.html`)
- User management (search, ban/unban, role promotion)
- Balance adjustment (credit/debit/set with reason)
- Mission CRUD
- News publisher
- Fraud monitor (severity-colored log table)
- Analytics dashboard (DAU, claims, new users, staking volume)
- CSV export
- Audit trail for every admin action

## 🌐 Internationalization
- Arabic + English (auto-detect from browser)
- RTL layout auto-flip
- Language switcher in nav
- Cookie-persisted preference

## 📱 PWA
- Installable on iOS/Android/desktop
- Offline mode (cached assets)
- Push notifications (via Firebase Cloud Messaging — add FCM config to enable)
- Smart cache strategies (cache-first for assets, network-first for HTML)
- Background sync (placeholder for offline action queue)

## 🔍 SEO
- Per-page meta tags + OpenGraph + Twitter Cards
- JSON-LD structured data (Organization, WebSite)
- Canonical URLs
- `robots.txt` (blocks admin, allows public)
- `sitemap.xml` with all 18 pages
- hreflang alternates (EN/AR)

## 🎨 Design
- Brand: gold (#f59e0b) + Nile cyan (#06b6d4)
- Dark theme default (light theme available)
- Custom font stack: Inter + Plus Jakarta Sans + Cairo (Arabic)
- Mobile-first responsive (breakpoints at 380/768/1024/1440)
- Touch targets min 44×44px
- Safe-area insets for notched devices
- Reduced-motion support
- Cinematic 404 page (coin falls into Nile with ripples, splashes, fog, bubbles)

## ⚠️ Production Hardening Checklist

Before going live with real users:

1. **Move balance mutations to Cloud Functions** — client-side `runTransaction` is OK for MVP but allows tampering attempts. Cloud Functions guarantee server authority.
2. **Add reCAPTCHA Enterprise** to sign-in and claim flows for stronger bot protection.
3. **Enable App Check** in Firebase to block unauthorized clients.
4. **Set up FCM (Firebase Cloud Messaging)** for real push notifications (currently browser notifications only fire when tab is open).
5. **Configure Firebase Hosting** with custom domain `ndogcoin.com` and SSL.
6. **Set up monitoring** — Firebase Crashlytics for web, Google Analytics 4 events.
7. **Add IP-based rate limiting** at the edge (Firebase Hosting + Cloudflare).
8. **Audit `database.rules.json`** with Firebase Simulator before publishing.
9. **Backup Realtime Database** daily via scheduled Cloud Function export to Cloud Storage.
10. **Enable 2FA for admin accounts** (enforce via Google account security).

## 📄 License
© 2026 NileDogs. All rights reserved.

NDOG is a community token. Not financial advice.
