# Setup & Deployment Guide

## Local development

### Backend
```bash
cd backend
cp .env.example .env
npm install
npm start          # http://localhost:4000
npm test           # unit tests for H-index, prediction, and venue-tier logic
```
`DEMO_MODE=true` (the default) runs entirely in memory — no database needed. Data resets every time you restart the server. This is the fastest way to develop and test.

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev         # http://localhost:5173
```
Works standalone with demo data even if the backend isn't running — click "Use demo data" on the search page.

---

## Going to production (real database + real users)

### 1. Provision Postgres on Supabase (free tier)
1. Create a project at supabase.com.
2. In the SQL editor, paste and run the contents of `backend/schema.sql`.
3. Copy the connection string from Project Settings → Database → Connection string (URI, "Session pooler" mode recommended for serverless-style hosts).

### 2. Update backend environment
In `backend/.env` (or your host's environment variable settings):
```
DEMO_MODE=false
DATABASE_URL=<your Supabase connection string>
PGSSL=true
JWT_SECRET=<generate a long random string, e.g. `openssl rand -hex 32`>
FRONTEND_ORIGIN=<your deployed frontend URL>
```

### 3. Deploy the backend (Railway)
1. Push this repo to GitHub.
2. In Railway, "New Project" → "Deploy from GitHub repo" → select the repo, set the root directory to `backend/`.
3. Add the environment variables from step 2 in Railway's Variables tab.
4. Railway auto-detects `npm start`. Once deployed, note the public URL (e.g. `https://your-app.up.railway.app`).
5. Every `git push origin main` auto-redeploys if GitHub integration is connected.

### 4. Deploy the frontend (Vercel)
1. In Vercel, "New Project" → import the same GitHub repo → set root directory to `frontend/`.
2. Framework preset: Vite. Build command `npm run build`, output directory `dist`.
3. Add environment variable `VITE_API_URL=https://your-app.up.railway.app/api` (your Railway URL from step 3).
4. Deploy. Vercel gives you a `*.vercel.app` URL immediately; connect a custom domain under Project Settings → Domains if you bought one (e.g. via Namecheap, ~$1/mo first year for some TLDs).

### 5. Smoke test in production
- `curl https://your-app.up.railway.app/health` → should show `demoMode: false`.
- Sign up through the deployed frontend, add a real Semantic Scholar ID, confirm the dashboard populates.

---

## Social sign-in (optional)

Email/password auth works without this configured — the Google button shows as a "not configured" placeholder until you set the env vars below.

### Google Sign-In (free)
1. Go to console.cloud.google.com/apis/credentials → create a project if you don't have one.
2. "Create Credentials" → "OAuth client ID" → Application type: **Web application**.
3. Under "Authorized JavaScript origins" add `http://localhost:5173` (dev) and your deployed frontend URL (prod).
4. Copy the generated Client ID.
5. Set it as **both**:
   - `GOOGLE_CLIENT_ID` in `backend/.env`
   - `VITE_GOOGLE_CLIENT_ID` in `frontend/.env`
6. Restart both servers. No client secret is needed — the frontend gets an ID token directly from Google and the backend verifies its signature.

---

## Stripe paywall (Pro plan)

Predictions and the collaboration advisor are gated behind a Pro subscription. This is real payment-processing code, but **I cannot create your Stripe account or process real payments for you** — you own that account and its funds. Everything below is one-time setup you do yourself.

### 1. Create your Stripe account and a Product
1. Sign up at dashboard.stripe.com (free).
2. Stay in **Test mode** (toggle top-right) while developing — test mode uses fake cards, no real money moves.
3. Products → Add a product, e.g. "Research GPS Pro", recurring price $4.99/month. Copy the **Price ID** (starts `price_...`).

### 2. Get your API keys
1. Developers → API keys → copy the **Secret key** (test mode: starts `sk_test_...`).
2. Set in `backend/.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRICE_ID=price_...
   FRONTEND_URL=http://localhost:5173
   ```

### 3. Set up the webhook (keeps plan status in sync)
Stripe needs to tell your backend when a payment succeeds or a subscription cancels.

**Local development** — use the Stripe CLI:
```bash
stripe login
stripe listen --forward-to localhost:4000/api/billing/webhook
```
This prints a webhook signing secret (`whsec_...`) — put it in `backend/.env` as `STRIPE_WEBHOOK_SECRET`. Keep `stripe listen` running while you test checkout locally.

**Production** — in the Stripe Dashboard: Developers → Webhooks → Add endpoint → URL `https://your-backend-url/api/billing/webhook` → select events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the signing secret it gives you into your production `STRIPE_WEBHOOK_SECRET`.

### 4. Test the full flow
1. Restart the backend so it picks up the new env vars.
2. Log in, go to the Predictor or Actions page with a real (non-demo) researcher — you'll see the "Upgrade to Pro" paywall.
3. Click it — you're redirected to Stripe's hosted checkout. Use a [Stripe test card](https://docs.stripe.com/testing#cards) like `4242 4242 4242 4242`, any future expiry, any CVC.
4. After paying, you're redirected back and the feature unlocks (may take a few seconds for the webhook to land).

### 5. Going live
Switch the Dashboard out of Test mode, create a live-mode Product/Price, and swap in your live `sk_live_...` key, live Price ID, and a webhook endpoint pointed at your production webhook secret. Stripe requires business verification (bank details, tax info) before you can accept real payments — that's between you and Stripe, not something this app can do for you.

## Beta testing

1. Share the Vercel URL with your first 20-30 users (labmates, Twitter/LinkedIn, r/PhD, r/gradschool — post text is your call since it's outward-facing communication I shouldn't draft and send on your behalf without your review).
2. Ask them to sign up and add their own Semantic Scholar ID.
3. Collect feedback via a simple Google Form or Typeform link — not built into the app in this MVP.
4. Watch Railway logs (or add a lightweight logging/monitoring add-on) for errors during the test window.

## Cost reference (first month)

| Item | Cost |
|---|---|
| Domain (optional) | ~$1/mo |
| Railway (backend) | ~$5-6/mo (usage-based, may qualify for free trial credit) |
| Supabase (database) | Free tier |
| Vercel (frontend) | Free tier |

Exact pricing changes over time — check railway.app/pricing, vercel.com/pricing, and supabase.com/pricing before committing.
