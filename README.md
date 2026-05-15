# StepSync Pro — Fitness Platform

A production-ready PWA step tracker upgraded into a full fitness platform. Runs entirely offline, works on any mobile browser, and is installable as a native-like app.

---

## 📁 File Structure

```
stepsync-v2/
├── index.html              # App shell + all tab layouts
├── manifest.json           # PWA manifest (install metadata)
├── sw.js                   # Service Worker (offline + push)
├── css/
│   └── style.css           # Dark/light theme, all components
├── js/
│   ├── storage.js          # IndexedDB + localStorage dual layer
│   ├── sensor.js           # Step detection (3-stage algorithm)
│   ├── recommend.js        # Rule-based AI engine
│   ├── notifications.js    # Push + inactivity alerts
│   ├── water.js            # Water intake + 2-hr reminders
│   ├── gamification.js     # Coins, challenges, rewards shop
│   ├── tracker.js          # Core step/calorie/distance engine
│   ├── chart-view.js       # Chart.js history graph
│   ├── ui.js               # All DOM rendering
│   └── app.js              # Entry point, wires everything
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## 🗺 Implementation Roadmap (5 Weeks)

### Week 1 — Core Stability
- [x] Upgrade step detection to 3-stage peak algorithm (`sensor.js`)
- [x] Migrate localStorage → IndexedDB via `storage.js`
- [x] Add Wake Lock API to prevent screen-off during tracking
- [ ] **Next:** Test on real Android/iOS devices; tune `PEAK_THRESHOLD` (12–15 m/s²) per device

### Week 2 — Health & Personalization
- [x] User profile modal (age, height, weight, gender, goal, activity)
- [x] BMI, TDEE, water, and AI step target calculations (`recommend.js`)
- [x] Workout plan + diet tips rendered in Health tab
- [ ] **Next:** Add profile photo upload; persist avatar to IndexedDB as base64

### Week 3 — Gamification & Coins
- [x] Coin system: 1 coin per 100 steps
- [x] Daily + weekly challenges with progress bars
- [x] Rewards shop (badges, ad-free day, themes)
- [x] Coin popup micro-animation on earn
- [ ] **Next:** Add streak tracking (consecutive goal days); award bonus coins

### Week 4 — Notifications & Water
- [x] Push notification permission flow
- [x] Goal progress reminder at 2 PM
- [x] Inactivity alert after 1 hour
- [x] Water intake tracker with 2-hour reminders
- [ ] **Next:** Register actual push subscription with VAPID key + backend endpoint

### Week 5 — Monetization & Firebase Sync
- [ ] Firebase Auth (email/Google sign-in)
- [ ] Firestore cross-device sync (step records, coins)
- [ ] AdMob rewarded video integration (web via iframe or Capacitor)
- [ ] Stripe subscription ($2.99/month) using Stripe Checkout

---

## 1. Accurate Step Detection Algorithm

**Location:** `js/sensor.js`

Three-stage pipeline implemented:

```
Raw DeviceMotion → [Stage 1: Low-pass smoother] → [Stage 2: Peak detector] → [Stage 3: Time gate]
```

**Stage 1 – Rolling average (window=4):** Removes vibration noise without adding lag.

**Stage 2 – Zero-crossing peak detection:**
```
if magnitude rises above PEAK_THRESHOLD (13.5 m/s²)  → mark as peak
if magnitude then falls below LOW_THRESHOLD (8.0 m/s²) → confirm step
```
This avoids double-counting the same footfall's oscillation.

**Stage 3 – Time gate (MIN_STEP_MS = 250ms):**
Steps faster than 250ms apart (>4/sec) are physiologically impossible walking — reject as bounce noise.

**Tuning for your device:**
```js
const PEAK_THRESHOLD = 13.5;  // raise to 15+ for noisy devices
const LOW_THRESHOLD  = 8.0;   // keep ~60% of PEAK_THRESHOLD
const MIN_STEP_MS    = 250;    // lower to 200 for very fast runners
```

---

## 2. Background Tracking

**PWA approach (implemented):**
```js
// Wake Lock — keeps screen on while tracking
window._wakeLock = await navigator.wakeLock.request('screen');
```

**Service Worker sync fallback:** When app resumes from background, `DOMContentLoaded` re-initialises Tracker from IndexedDB, recovering any steps counted before backgrounding (mock mode only — real sensor stops in background on all mobile browsers).

**Capacitor (native conversion) — when you need true background:**
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init StepSyncPro com.stepsync.pro
# Copy built web files:
npx cap copy android
# Use Capacitor's @capacitor/motion plugin for background pedometer
npm install @capacitor/motion
```
With Capacitor + Android foreground service, the real accelerometer runs in a persistent service — identical to native apps.

---

## 3. Smart Notifications

**Location:** `js/notifications.js`

```js
// Example: send a notification from anywhere
Notifications.send('🏃 Time to Move!', 'You haven\'t moved in an hour.');

// Schedule goal reminder at 2 PM
Notifications.scheduleGoalReminder({ goal: 10000 });

// Enable inactivity detection (resets on every step)
Notifications.resetInactivityTimer(); // call from tracker on each step
```

**Push subscription setup** (Week 4 task):
```js
const reg = await navigator.serviceWorker.ready;
const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(YOUR_VAPID_PUBLIC_KEY)
});
// POST sub to your server → store → send via web-push npm package
```

---

## 4. Recommendation Engine

**Location:** `js/recommend.js`

```
Step Target = BASE(5000) + activityMultiplier × 1000 × (weight/70) + goalBonus

Weight loss  → +2000 steps
Endurance    → +4000 steps
Muscle gain  → +500 steps

TDEE = BMR × PAL   (Mifflin-St Jeor + Harris-Benedict activity factor)
Water = weight(kg) × 0.033 L/day  (+0.5L if active/very_active)
Calories = MET × weight × duration(hours)
```

---

## 5. Coin System

**Location:** `js/gamification.js`

| Action | Coins |
|--------|-------|
| 100 steps walked | +1 coin |
| Daily challenge complete | +10–35 coins |
| Weekly challenge complete | +50–200 coins |

**Spend:**
| Item | Cost |
|------|------|
| Bronze Badge | 50 coins |
| Silver Badge | 150 coins |
| Gold Badge | 300 coins |
| Ad-Free Day | 25 coins |
| Neon Theme | 100 coins |
| Fire Legend Badge | 500 coins |

---

## 💰 Monetization Strategy

### Model 1 — Rewarded Video Ads
Users watch a 30-second ad to earn **+50 bonus coins**. Integrate via:
- **Web:** Google AdSense rewarded units or AdMob (via Capacitor)
- Reward gate: `if (adWatched) Storage.addCoins(50);`
- Non-intrusive: shown only when user taps "Watch ad for coins" button

### Model 2 — Premium Subscription ($2.99/month)
Gate these features behind a `isPremium` flag stored in Firebase user profile:
- Unlimited history (vs 30 days free)
- Advanced analytics (pace, elevation via GPS)  
- Custom challenge creation
- No ads

```js
// Stripe Checkout integration
const session = await fetch('/api/create-checkout', {
  method: 'POST',
  body: JSON.stringify({ priceId: 'price_XXXX', userId: user.uid })
});
window.location = session.url; // redirects to Stripe-hosted page
```

### Model 3 — Coin Packs (In-App Purchase)
| Pack | Coins | Price |
|------|-------|-------|
| Starter Pack | 500 coins | $0.99 |
| Value Pack | 1,500 coins | $2.49 |
| Mega Pack | 5,000 coins | $6.99 |

Use Stripe Payment Links or RevenueCat for cross-platform IAP management.

---

## 🔒 Security Checklist (10 Points)

1. **HTTPS mandatory** — PWAs require HTTPS. Use Cloudflare, Netlify, or Vercel (all free TLS).

2. **Firebase Security Rules** — Never allow open reads/writes:
   ```
   match /users/{uid} {
     allow read, write: if request.auth.uid == uid;
   }
   ```

3. **Health data encryption at rest** — For sensitive fields (weight, medical), encrypt before storing:
   ```js
   // Web Crypto API — AES-GCM
   const key = await crypto.subtle.generateKey(
     { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
   );
   const iv = crypto.getRandomValues(new Uint8Array(12));
   const encrypted = await crypto.subtle.encrypt(
     { name: 'AES-GCM', iv }, key, new TextEncoder().encode(sensitiveData)
   );
   ```

4. **No PII in analytics** — Log `user_id` hashes only; never log `name`, `email`, `weight`.

5. **Content Security Policy** — Add to HTTP headers:
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self' cdn.jsdelivr.net fonts.googleapis.com
   ```

6. **Input validation** — All numeric fields validated before save (min/max bounds enforced in `app.js`).

7. **Firebase Authentication** — Never store passwords client-side; use Firebase Auth SDK only. Support Google Sign-In as primary method (lower phishing risk than email/password).

8. **Coin integrity** — Coin calculations happen client-side (acceptable for casual games). For competitive leaderboards, validate server-side: compare claimed coins against step records.

9. **Service Worker scope** — Keep SW registered at `./` scope only; never register at `/` on shared hosting to avoid intercepting unrelated pages.

10. **Dependency pinning** — The Chart.js CDN URL uses a pinned version (`@4.4.0`). For production, self-host or add `integrity` SRI hash:
    ```html
    <script src="..." integrity="sha384-XXXX" crossorigin="anonymous"></script>
    ```

---

## 🚀 Deploy

```bash
# Option A: Netlify drag-and-drop
# Zip the stepsync-v2/ folder → drag to netlify.com/drop

# Option B: Vercel CLI
npm i -g vercel
cd stepsync-v2
vercel --prod

# Option C: GitHub Pages
git init && git add . && git commit -m "StepSync Pro"
git remote add origin https://github.com/YOUR/repo.git
git push -u origin main
# Enable Pages in repo Settings → Pages → Deploy from main branch
```

---

## 🔧 Firebase Setup (Week 5)

```bash
npm install firebase
```

```js
// js/firebase.js — add before storage.js in index.html
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const app = initializeApp({
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT"
});

export const db   = getFirestore(app);
export const auth = getAuth(app);

// Sync today's steps to Firestore
export async function syncToFirebase(uid, dayData) {
  await setDoc(doc(db, 'users', uid, 'days', dayData.date), dayData, { merge: true });
}
```

Add `syncToFirebase(user.uid, today)` inside `Storage.saveToday()` when the user is logged in.
