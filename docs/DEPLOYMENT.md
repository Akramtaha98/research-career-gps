# Deployment & go-live runbook

Everything needed to take Research GPS from "works locally" to "publicly launched and stays up". Work top to bottom the first time; the **Pre-launch checklist** at the end is the short version for subsequent deploys.

---

## 1. Architecture

| Piece | Host | What it needs |
| --- | --- | --- |
| API (`backend/`) | Railway | Node 18+, all env vars from `backend/.env.example` |
| Web app (`frontend/`) | Vercel | `VITE_*` env vars, static build output |
| Database | Supabase Postgres | Migrations applied manually |
| Email | Resend | Verified sending domain |
| Payments | Stripe | Live keys + webhook endpoint |

The frontend and API are separate origins, so **CORS is not optional** — see step 4.

---

## 2. Database (Supabase)

Migrations are numbered, idempotent SQL in `backend/migrations/`. They are **not** run automatically on deploy — this is deliberate, so a bad deploy can never mangle production data.

Apply them in order in the Supabase SQL editor:

```
001 … 010   (010_email_verification_and_digest.sql is the current head)
```

Verify afterwards, don't assume:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

Migrations 001–010 are confirmed applied to the live project (`txdztkxqbquewryffudu`). **Any new migration needs the same manual step plus live verification before it counts as done.**

### Known advisory: Row Level Security

RLS is disabled on all public tables. The backend connects via a direct `DATABASE_URL` rather than the Supabase client SDK or anon key, so this is not believed to be exploitable today — no untrusted client ever talks to Postgres directly.

**Do not enable RLS without also writing policies.** Turning it on alone will lock the application out of its own tables. If you want it on (worth doing before any future feature exposes the anon key), the work is: write a policy per table allowing the service role, then enable RLS per table, then re-run the full backend test suite against a branch database.

---

## 3. API on Railway

1. Point Railway at the repo, root directory `backend/`.
2. Build: `npm install` · Start: `npm start` (already in `package.json`).
3. Set every variable from `backend/.env.example`. The ones that actually matter for a working, secure production deploy:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` — gates error-message redaction in `utils/sendError.js` |
| `DEMO_MODE` | `false` |
| `DATABASE_URL` | Supabase connection string |
| `PGSSL` | `true` |
| `JWT_SECRET` | 32+ random chars (`openssl rand -hex 32`). The server logs a loud warning on boot if this is weak — check the logs after first deploy. |
| `FRONTEND_ORIGIN` | Your Vercel URL, plus the custom domain once live, comma-separated |
| `FRONTEND_URL` | Same, used to build email links |
| `API_BASE_URL` | The Railway URL + `/api` |
| `DISABLE_RATE_LIMIT` | **must be `false` or unset** — it's a test-only escape hatch |
| `ENABLE_KEEP_ALIVE` | `true` (see §6) |
| `RESEND_API_KEY`, `EMAIL_FROM` | From Resend, with a verified domain |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Live-mode keys |

4. After the first deploy, confirm both probes:

```bash
curl https://<your-app>.up.railway.app/health   # {"status":"ok", ...}
curl https://<your-app>.up.railway.app/ready    # {"status":"ok","database":"connected", ...}
```

`/ready` returning `503 database: unreachable` means `DATABASE_URL`/`PGSSL` are wrong — fix before going further, because the app will otherwise look fine until a user's first real request.

---

## 4. Web app on Vercel

1. Root directory `frontend/`, framework preset Vite. Build `npm run build`, output `dist`.
2. Env vars:
   - `VITE_API_URL` → `https://<your-app>.up.railway.app/api`
   - `VITE_GOOGLE_CLIENT_ID`, `VITE_ORCID_CLIENT_ID`, `VITE_ORCID_REDIRECT_URI`
3. **Then go back to Railway** and make sure `FRONTEND_ORIGIN` contains the exact Vercel origin. A mismatch here is the single most common cause of "the site loads but every request fails" — it presents as a CORS error in the browser console, not as a server error.

---

## 5. Custom domain

1. Add the domain in Vercel → DNS records as instructed.
2. Add it to Railway's `FRONTEND_ORIGIN` (comma-separated alongside the Vercel URL — keep both so preview deploys keep working).
3. Update `FRONTEND_URL` on Railway so email links point at the real domain.
4. Update the hard-coded URLs in:
   - `frontend/index.html` — `og:url`, `twitter:url`, `canonical`
   - `frontend/public/robots.txt` — the `Sitemap:` line
   - `frontend/public/sitemap.xml` — every `<loc>`
5. Re-register the ORCID redirect URI and the Google OAuth authorised origin against the new domain.

---

## 6. Keeping the services awake

Free/hobby tiers idle out, and the two services do it for **different reasons** — one fix does not cover both. `backend/services/keepAlive.js` handles each:

- **Railway** sleeps the container when no *inbound HTTP* arrives. A cron pings the app's own public `/health` every 10 minutes. It must be the public URL — a loopback request keeps Node busy but doesn't reset Railway's edge idle timer, which is what actually causes the slow first load.
- **Supabase** pauses a free project after ~7 days with no *database* activity. HTTP traffic doesn't count; only a query does. A `SELECT 1` runs every 6 hours — a ~28× safety margin.

On Railway this needs **no configuration**: `RAILWAY_PUBLIC_DOMAIN` is injected automatically. Set `PUBLIC_URL` only for a custom domain or another host. Set `ENABLE_KEEP_ALIVE=false` once on paid plans that never idle.

Confirm it's live by looking for these lines in the Railway deploy logs:

```
Keep-alive: pinging https://… /health every 10 minutes to prevent Railway idle-sleep.
Keep-alive: touching the database every 6 hours to prevent Supabase free-tier pausing.
```

An external uptime monitor (UptimeRobot, Better Stack) pointed at `/health` is still worth adding — it's independent of the app, so it also catches the case where the app is down entirely and therefore can't ping itself.

---

## 7. Stripe

1. Switch to live mode, copy `STRIPE_SECRET_KEY` and the price ID.
2. Add a webhook endpoint → `https://<your-app>.up.railway.app/api/billing/webhook`, copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Test with a real card in live mode, then refund. The webhook route is mounted **before** `express.json()` because signature verification needs the raw body — don't reorder that in `server.js`.

---

## 8. Pre-launch checklist

**Security**
- [ ] `JWT_SECRET` is 32+ random chars; no boot warning in the logs
- [ ] `NODE_ENV=production`
- [ ] `DISABLE_RATE_LIMIT` is `false`/unset
- [ ] `FRONTEND_ORIGIN` is a real origin list, not `*` (the server warns if it is)
- [ ] `.env` files are gitignored and no secrets are in the repo history
- [ ] RLS advisory reviewed and consciously accepted (§2)

**Correctness**
- [ ] Migrations 001–010 applied *and verified* against live
- [ ] `/health` returns 200, `/ready` reports `database: connected`
- [ ] `cd backend && npm test` — 56 passing
- [ ] `cd frontend && npx vitest run` — 48 passing
- [ ] `cd frontend && npm run build` — clean
- [ ] Sign up → verify email → search → dashboard → predictor, end to end on the live site

**Reliability**
- [ ] Keep-alive lines present in the Railway logs
- [ ] External uptime monitor on `/health`
- [ ] Snapshot + digest crons enabled on exactly one instance

**Polish**
- [ ] Custom domain live, all hard-coded URLs updated (§5)
- [ ] `sitemap.xml` and `robots.txt` point at the real domain
- [ ] Open Graph preview checked (paste the URL into Slack/WhatsApp)
- [ ] Dark mode and at least one RTL language (Arabic) spot-checked
- [ ] Mobile viewport checked — nav collapses, chat and feedback buttons don't overlap

---

## 9. Rollback

Railway and Vercel both keep previous deploys; redeploy the last good one from their dashboards. **Migrations don't roll back automatically** — they're written `IF NOT EXISTS`/additive precisely so an older build keeps working against a newer schema, but a migration that drops or renames anything would break that property. Keep them additive.
