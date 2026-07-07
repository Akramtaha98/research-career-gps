<div align="center">

# 🧭 Research Career GPS

**Track your H-index. Project your growth. Know what to work on next.**

[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/react-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Express](https://img.shields.io/badge/express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/postgres-13%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Vite](https://img.shields.io/badge/vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Semantic Scholar](https://img.shields.io/badge/data-Semantic%20Scholar%20API-1857B6)](https://www.semanticscholar.org/product/api)
[![Stripe](https://img.shields.io/badge/billing-Stripe-635BFF?logo=stripe&logoColor=white)](https://stripe.com)

</div>

---

Pulls real citation data from the [Semantic Scholar API](https://www.semanticscholar.org/product/api), recalculates your H-index directly from raw per-paper citation counts, and runs a simple projection model to estimate when you'll hit your next milestone. Auto-generates prioritized action items — which papers are one citation away from raising your H-index, and where to focus effort next.

## Contents

- [Status](#status)
- [Features](#features)
- [Freemium model](#freemium-model)
- [Stack](#stack)
- [Quick start](#quick-start)
- [Project structure](#project-structure)
- [How the core algorithms work](#how-the-core-algorithms-work)
- [Docs](#docs)
- [Scope notes](#notes-on-scope-vs-the-original-spec)

## Status

Working MVP, verified end-to-end:

| Component | Status |
|---|---|
| Backend API | ✅ All endpoints tested live against a real Semantic Scholar author (auth, search, researcher lookup, papers, action items, collaborators, predictions, billing) |
| Unit tests | ✅ 11/11 passing (`backend/tests/`) — H-index, prediction engine, venue-tier weighting |
| Paywall | ✅ Verified end-to-end — free plan blocked with 402, simulated upgrade unlocks Pro routes immediately |
| Frontend | ✅ Builds clean with Vite, works standalone on demo data with zero backend required |
| Deployment | ⏳ Not yet live — needs your Railway/Vercel/Supabase accounts, see [`docs/SETUP.md`](docs/SETUP.md) |
| Beta users | ⏳ Not started |

## Features

- **Search by name** — type a researcher's name, pick the right match from Semantic Scholar's disambiguated results (or paste a known Author ID directly)
- **Live H-index tracking** — real papers and citation counts pulled straight from Semantic Scholar
- **Growth chart** — H-index and citation history over time
- **Prediction calculator** — set a target H-index, growth rate, and target-venue tier, see an estimated timeline *(Pro)*
- **Collaboration advisor** — your most frequent real co-authors, ranked by their own h-index *(Pro)*
- **Auto-generated action items** — near-miss papers, publication cadence, venue strategy *(free)*
- **Google sign-in** — alongside email+password (needs a free Google Cloud OAuth client to activate, see `docs/SETUP.md`)
- **Demo mode** — the whole app works instantly with sample data, no signup, database, or payment required

## Freemium model

| Plan | Includes |
|---|---|
| Free | Search, live H-index/citation tracking, growth chart, action items, demo mode (fully functional, no card needed) |
| Pro ($4.99/mo) | Prediction calculator + venue-tier weighting, collaboration advisor — for a real (non-demo) tracked researcher |

Billed via Stripe Checkout (`docs/SETUP.md` has the full walkthrough). This app never touches card details directly — Stripe hosts the payment form, and a webhook keeps each user's plan in sync.

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 18+, Express, PostgreSQL (`pg`), JWT auth, bcrypt, Stripe |
| Frontend | React 18, Vite, Tailwind CSS, Chart.js (`react-chartjs-2`), React Router, Axios |
| Data source | Semantic Scholar Graph API (no key required) |
| Demo mode | In-memory data store (`DEMO_MODE=true`) — no database needed for local dev |

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

Open `http://localhost:5173` — it lands on the researcher search page. Click **"Use demo data"** to explore the dashboard, predictor, and action items instantly, or sign up and enter a real Semantic Scholar Author ID (e.g. `1741101`) to pull live data.

## Project structure

<details>
<summary>Expand file tree</summary>

```
research-career-gps/
├── backend/
│   ├── server.js                  Express app entrypoint (Stripe webhook mounted with raw body parsing)
│   ├── config/db.js               Postgres pool + demo-mode switch
│   ├── services/
│   │   ├── store.js                Data layer (Postgres or in-memory, same interface)
│   │   ├── semanticScholar.js      Semantic Scholar API wrapper, search, collaborators, rate-limit handling
│   │   ├── socialAuth.js            Google ID token verification
│   │   └── stripeService.js         Checkout session creation + webhook signature verification
│   ├── utils/
│   │   ├── hIndex.js                H-index calculation
│   │   ├── prediction.js            Linear projection engine (with venue-tier multiplier)
│   │   ├── actionItems.js           Recommendation heuristics
│   │   └── venueTiers.js            Hand-curated venue-tier multipliers (not a real impact-factor DB)
│   ├── middleware/                requireAuth (JWT), requirePro (subscription gate)
│   ├── controllers/, routes/
│   ├── schema.sql                 Postgres schema (run against Supabase/any Postgres)
│   └── tests/hIndex.test.js       Unit tests (node:test — no extra deps)
├── frontend/
│   └── src/
│       ├── pages/                 Login, Signup, Search, Dashboard, Predictor, Actions
│       ├── components/            Navbar, MetricCard, HIndexChart, EmptyState, SocialLogin,
│       │                          CollaborationAdvisor, UpgradeCTA, ProtectedRoute
│       ├── context/                AuthContext, ResearcherContext
│       ├── data/demoData.js        Standalone demo dataset (incl. demo collaborators)
│       └── utils/                  Client-side mirrors of the H-index/prediction/action/venue logic
└── docs/
    ├── API.md
    ├── SETUP.md
    └── USER_GUIDE.md
```

</details>

## How the core algorithms work

**H-index** — standard definition: the largest `h` such that `h` papers have at least `h` citations each. Recomputed from Semantic Scholar's raw per-paper citation counts (not trusted from their cached `hIndex` field), so it's always internally consistent with the citation data shown in the dashboard.

**Prediction engine** — a simple linear simulation. Each month, every existing tracked paper gains `monthlyCitationRate` citations on average; new papers are added at `papersPerYear`, entering at 0 citations. An optional venue-tier multiplier scales how fast *new* papers (not existing ones) accumulate citations, modeling "publishing in a higher-impact venue going forward." The simulation runs month-by-month (capped at 20 years) until the target H-index is reached, returning the month count and a full path for charting.

**Action items** — heuristic, not ML. Flags papers within 5 citations of crossing the H-index threshold (fastest wins), papers with 0-1 citations (visibility/collaboration push), publication cadence over the last 2 years, and a general venue-strategy nudge.

**Collaboration advisor** — aggregates co-authors across the researcher's real tracked papers (from Semantic Scholar's `papers.authors` field), batch-fetches each co-author's own stats, and ranks them by h-index. Surfaces existing strong collaborators rather than inventing connections.

**Venue tiers** — a small hand-maintained list (`utils/venueTiers.js`), explicitly *not* a real journal impact-factor/SJR database (those require a paid license). Treat it as a directional heuristic you can edit for your own field.

## Docs

| Doc | Contents |
|---|---|
| [`docs/API.md`](docs/API.md) | Full endpoint reference |
| [`docs/SETUP.md`](docs/SETUP.md) | Local dev + Railway/Vercel/Supabase deployment steps |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | How to use the app, FAQ |

## Notes on scope vs. the original spec

A few deliberate substitutions, made for stability/time:

- **React 18** instead of React 19 — `react-chartjs-2` and the broader ecosystem are most battle-tested there; upgrading later is a low-risk change.
- **Google sign-in only** — Apple Sign In was evaluated but requires a paid ($99/yr) Apple Developer account plus domain verification, so it was dropped from this pass. Google needs only a free OAuth client.
- **Venue-tier weighting is a heuristic, not a real database** — no free, reliable journal impact-factor/SJR API exists; the multiplier list in `utils/venueTiers.js` is hand-curated and editable.
- Deployment, Stripe account setup, beta testing with real users, and marketing posts need your accounts and outreach — see [`docs/SETUP.md`](docs/SETUP.md) for copy-pasteable steps.
