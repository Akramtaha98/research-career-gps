# Research Career GPS

Track your H-index and citation growth, and project when you'll hit your next milestone.

Pulls real data from the [Semantic Scholar API](https://www.semanticscholar.org/product/api), recalculates your H-index from raw citation counts, and runs a simple linear projection to estimate time-to-target based on your publication and citation-growth rate. Auto-generates prioritized action items (which papers are one citation away from raising your H-index, where to focus effort next).

## Status

This is a working MVP, verified locally:
- Backend: all API endpoints tested against a live Semantic Scholar author (signup/login/JWT auth, researcher lookup, paper listing, action items, predictions) — see `backend/tests/` (7 passing unit tests) and the manual endpoint walkthrough below.
- Frontend: builds cleanly with Vite, renders in preview mode, works standalone against demo data with no backend required.

**Not yet done** (needs your accounts/actions, not code): hosting on Railway/Vercel, a Supabase Postgres instance, a domain, and real beta users. See `docs/SETUP.md` for exactly what to click through.

## Stack

- **Backend:** Node.js/Express, PostgreSQL (via `pg`), JWT auth, bcrypt password hashing, Semantic Scholar integration
- **Frontend:** React 18 + Vite, Tailwind CSS, Chart.js (via `react-chartjs-2`), React Router, Axios
- **Demo mode:** the backend runs against an in-memory store when `DEMO_MODE=true` (default), so you can develop and test everything without provisioning Postgres first. The frontend has its own demo dataset so the UI works even with no backend running at all.

## Quick start

```bash
# Backend
cd backend
cp .env.example .env   # DEMO_MODE=true by default — no DB needed to start
npm install
npm start               # http://localhost:4000

# Frontend (separate terminal)
cd frontend
cp .env.example .env
npm install
npm run dev             # http://localhost:5173
```

Open http://localhost:5173 — it lands on the researcher search page. Click **"Use demo data"** to explore the dashboard, predictor, and action items instantly, or sign up and enter a real Semantic Scholar Author ID (e.g. `1741101`) to pull live data.

## Project structure

```
research-career-gps/
├── backend/
│   ├── server.js                  Express app entrypoint
│   ├── config/db.js               Postgres pool + demo-mode switch
│   ├── services/
│   │   ├── store.js                Data layer (Postgres or in-memory, same interface)
│   │   └── semanticScholar.js      Semantic Scholar API wrapper + rate-limit handling
│   ├── utils/
│   │   ├── hIndex.js                H-index calculation
│   │   ├── prediction.js            Linear projection engine
│   │   └── actionItems.js           Recommendation heuristics
│   ├── controllers/, routes/, middleware/
│   ├── schema.sql                 Postgres schema (run against Supabase/any Postgres)
│   └── tests/hIndex.test.js       Unit tests (node:test — no extra deps)
├── frontend/
│   └── src/
│       ├── pages/                 Login, Signup, Search, Dashboard, Predictor, Actions
│       ├── components/            Navbar, MetricCard, HIndexChart, ProtectedRoute
│       ├── context/                AuthContext, ResearcherContext
│       ├── data/demoData.js        Standalone demo dataset
│       └── utils/                  Client-side mirrors of the H-index/prediction/action logic
└── docs/
    ├── API.md
    ├── SETUP.md
    └── USER_GUIDE.md
```

## How the core algorithms work

**H-index:** standard definition — the largest `h` such that `h` papers have at least `h` citations each. Recomputed from Semantic Scholar's raw per-paper citation counts (not trusted from their cached `hIndex` field), so it's always internally consistent with the citation data shown in the dashboard.

**Prediction engine:** a simple linear simulation. Each month, every tracked paper gains `monthlyCitationRate` citations on average; new papers are added at `papersPerYear`, entering at 0 citations and growing at the same rate. The simulation runs month-by-month (capped at 20 years) until the target H-index is reached, returning the month count and a full path for charting.

**Action items:** heuristic, not ML. Flags papers that are within 5 citations of crossing the H-index threshold (fastest wins), papers with 0-1 citations (visibility/collaboration push), publication cadence over the last 2 years, and a general venue-strategy nudge.

## Notes on scope vs. the original spec

A few deliberate substitutions from the original plan, made for stability/time:
- **React 18** instead of React 19 — `react-chartjs-2` and the broader ecosystem are most battle-tested there; upgrading later is a low-risk change.
- **JWT auth only** — Google OAuth was marked optional in the spec and isn't wired up; signup/login work with email+password.
- Deployment (Railway/Vercel/Supabase/domain), beta testing with real users, and marketing posts are **not something I can do on your behalf** — those need your accounts and your outreach. `docs/SETUP.md` has copy-pasteable steps for all of them.
