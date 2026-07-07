# Setup & Deployment Guide

## Local development

### Backend
```bash
cd backend
cp .env.example .env
npm install
npm start          # http://localhost:4000
npm test           # 7 unit tests for H-index + prediction logic
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
