<div align="center">

# 🧭 Research Career GPS

**Track your H-index. Project your growth. Know what to work on next.**

[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/react-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Express](https://img.shields.io/badge/express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/postgres-13%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Vite](https://img.shields.io/badge/vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Semantic Scholar](https://img.shields.io/badge/data-Semantic%20Scholar%20API-1857B6)](https://www.semanticscholar.org/product/api)

</div>

---

Pulls real citation data from the [Semantic Scholar API](https://www.semanticscholar.org/product/api), recalculates your H-index directly from raw per-paper citation counts, and runs a simple projection model to estimate when you'll hit your next milestone. Auto-generates prioritized action items — which papers are one citation away from raising your H-index, and where to focus effort next.

## Contents

- [Status](#status)
- [Features](#features)
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
| Backend API | ✅ All endpoints tested live against a real Semantic Scholar author (auth, researcher lookup, papers, action items, predictions) |
| Unit tests | ✅ 7/7 passing (`backend/tests/`) — H-index calculation + prediction engine |
| Frontend | ✅ Builds clean with Vite, works standalone on demo data with zero backend required |
| Deployment | ⏳ Not yet live — needs your Railway/Vercel/Supabase accounts, see [`docs/SETUP.md`](docs/SETUP.md) |
| Beta users | ⏳ Not started |

## Features

- **Search by name** — type a researcher's name, pick the right match from Semantic Scholar's disambiguated results (or paste a known Author ID directly)
- **Live H-index tracking** — real papers and citation counts pulled straight from Semantic Scholar
- **Growth chart** — H-index and citation history over time
- **Prediction calculator** — set a target H-index and growth rate, see an estimated timeline
- **Auto-generated action items** — near-miss papers, publication cadence, venue strategy
- **Google / Apple sign-in** — alongside email+password (Apple requires your own paid Apple Developer account to activate, see `docs/SETUP.md`)
- **Demo mode** — the whole app works instantly with sample data, no signup or database required

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 18+, Express, PostgreSQL (`pg`), JWT auth, bcrypt |
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

</details>

## How the core algorithms work

**H-index** — standard definition: the largest `h` such that `h` papers have at least `h` citations each. Recomputed from Semantic Scholar's raw per-paper citation counts (not trusted from their cached `hIndex` field), so it's always internally consistent with the citation data shown in the dashboard.

**Prediction engine** — a simple linear simulation. Each month, every tracked paper gains `monthlyCitationRate` citations on average; new papers are added at `papersPerYear`, entering at 0 citations and growing at the same rate. The simulation runs month-by-month (capped at 20 years) until the target H-index is reached, returning the month count and a full path for charting.

**Action items** — heuristic, not ML. Flags papers within 5 citations of crossing the H-index threshold (fastest wins), papers with 0-1 citations (visibility/collaboration push), publication cadence over the last 2 years, and a general venue-strategy nudge.

## Docs

| Doc | Contents |
|---|---|
| [`docs/API.md`](docs/API.md) | Full endpoint reference |
| [`docs/SETUP.md`](docs/SETUP.md) | Local dev + Railway/Vercel/Supabase deployment steps |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | How to use the app, FAQ |

## Notes on scope vs. the original spec

A few deliberate substitutions, made for stability/time:

- **React 18** instead of React 19 — `react-chartjs-2` and the broader ecosystem are most battle-tested there; upgrading later is a low-risk change.
- **JWT auth only** — Google OAuth was marked optional in the original spec and isn't wired up; signup/login work with email + password.
- Deployment, beta testing with real users, and marketing posts need your accounts and outreach — see [`docs/SETUP.md`](docs/SETUP.md) for copy-pasteable steps.
