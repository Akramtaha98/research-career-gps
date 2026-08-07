# Research GPS

Track your H-index, understand exactly what's holding it back, and see when you'll hit your next milestone.

Research GPS pulls a researcher's real publication record from Semantic Scholar and OpenAlex, recomputes their H-index from the underlying citation data rather than trusting a cached number, and turns that into something actionable: which specific papers are closest to pushing the H-index up, what to prioritise, and a realistic projection of when a target is reachable.

**Live:** [research-career-gps.vercel.app](https://research-career-gps.vercel.app)

---

## Features

| Area | What it does |
| --- | --- |
| **Search** | Find a researcher by name (public, no account needed) or by Semantic Scholar author ID. Demo data available without signing up. |
| **Dashboard** | Live H-index, total citations, tracked-paper count and averages, all recomputed from the paper list. Per-paper "not mine / duplicate" corrections that survive refreshes. Add papers by DOI, verified against Crossref. |
| **H-index Frontier** | Exactly which papers need how many more citations to reach the next H-index — correctly handling the case where several papers must cross the threshold at once. |
| **Actions** | Prioritised recommendations: near-miss papers to promote, low-citation work to boost, venue strategy, publication cadence. |
| **Predictor** | Projects time-to-target-H using an age-aware citation model (slow start, peak around years 2–4, long tail) rather than a flat monthly rate. Venue tier adjusts the trajectory of future papers only. |
| **Timeline** | Recorded snapshot history, a "since your last visit" diff, and milestone celebrations. |
| **Real H-index history** | Reconstructs H-index year by year from actual per-paper citation-year data, going back further than tracking began. |
| **Verify** | Standalone ORCID-based academic verification: resolves the real profile, compares field by field, keeps an append-only history. |
| **Assistant** | In-app chat grounded entirely in the user's own computed data — it can't invent citation counts. |
| **Guide** | A step-by-step "How it works" tour of every section. |
| **Accounts** | Email/password, Google Sign-In, and Sign in with ORCID. Email verification, password reset, and an opt-in weekly progress digest. |
| **Also** | Dark mode, 6 languages (EN/ES/FR/DE/AR/MS), a site-wide feedback widget, and a Contact page. |

## Stack

- **Backend** — Node/Express, deployed on Railway. JWT auth, bcrypt, helmet, per-route rate limiting.
- **Frontend** — React + Vite + Tailwind, deployed on Vercel. react-i18next for localisation.
- **Database** — Supabase Postgres, reached over a direct `DATABASE_URL`.
- **Data sources** — Semantic Scholar (primary), OpenAlex (fallback and enrichment), Crossref (DOI verification), ORCID (identity).
- **Email** — Resend.
- **Payments** — Stripe (Pro tier gates Predictor on live data, plus collaborator suggestions).

## Quick start

```bash
git clone https://github.com/Akramtaha98/research-career-gps.git
cd research-career-gps

# Backend
cd backend
cp .env.example .env          # DEMO_MODE=true works with no database
npm install
npm run dev                   # http://localhost:4000

# Frontend (second terminal)
cd ../frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

`DEMO_MODE=true` runs against an in-memory store, so the whole app is explorable without provisioning Postgres. See `docs/SETUP.md` for the full walkthrough including Supabase, Google, ORCID, Stripe, and Resend setup.

## Tests

```bash
cd backend  && npm test        # 56 integration + unit tests (node:test + supertest)
cd frontend && npx vitest run  # 48 component + unit tests (Vitest + Testing Library)
cd frontend && npm run build   # production build must stay clean
```

Both suites plus the frontend build run in CI on every push — see `.github/workflows/ci.yml`.

## Project structure

```
backend/
  controllers/     route handlers
  services/        store (dual memory/pg), external APIs, email, schedulers, keep-alive
  utils/           h-index, prediction model, action items, error handling
  migrations/      numbered, idempotent SQL — applied to Supabase manually
  tests/
frontend/src/
  pages/           Search, Dashboard, Timeline, Predictor, Actions, Verify, HowItWorks, ...
  components/      MetricCard, HIndexChart, ChatWidget, FeedbackWidget, Modal, ...
  context/         Auth, Researcher, Theme
  utils/           mirrors of the backend's h-index/prediction logic for demo mode
  locales/         6 translation files, key parity enforced
docs/              SETUP.md, API.md, USER_GUIDE.md, DEPLOYMENT.md
```

## Notes on the numbers

- **H-index is always recomputed** from the tracked paper list rather than read from an upstream `hIndex` field, so a "not mine" correction immediately changes the headline figure.
- **Predictions are a model, not a promise.** The citation-aging curve is a deliberately simplified stand-in for the log-normal shapes documented in bibliometrics literature (e.g. Wang, Song & Barabási 2013), not a fitted model.
- **Reconstructed history is a lower bound** for past years: citing papers with no publication year on file can't be dated, so older years count only what can be dated. The current year uses the authoritative total instead.
- **Self-reported Scopus/WOS numbers are not scraped or auto-verified** beyond a single best-effort public GET. This was a deliberate decision — see `backend/services/externalProfileCheck.js`.

## License

Not currently licensed for redistribution.
