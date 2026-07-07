# API Reference

Base URL: `http://localhost:4000/api` (local) — replace with your deployed backend URL in production.

All authenticated endpoints require an `Authorization: Bearer <token>` header, obtained from `/auth/signup` or `/auth/login`.

## Health check

```
GET /health   (not under /api)
```
Returns `{ status, demoMode, timestamp }`. Use this to confirm the server and demo/production mode.

---

## Auth

### POST /api/auth/signup
Body: `{ email, name, password }` (password ≥ 8 chars)
201 → `{ token, user: { id, email, name, created_at } }`
409 if email already registered.

### POST /api/auth/login
Body: `{ email, password }`
200 → `{ token, user }`
401 on bad credentials.

### GET /api/auth/me
Auth required. Returns the current user.

### POST /api/auth/google
Body: `{ idToken }` — the credential returned by Google Identity Services on the frontend after the user picks their Google account.
200 → `{ token, user }`. Creates the user on first sign-in. Requires `GOOGLE_CLIENT_ID` to be set; returns 501 if not configured, 401 if the token is invalid/expired.

### POST /api/auth/apple
Body: `{ idToken, name? }` — `idToken` is Apple's `identityToken`. `name` is optional and only meaningful on the user's very first Apple sign-in (Apple omits it from later tokens; the frontend forwards it from the one-time `user` payload Apple provides).
200 → `{ token, user }`. Requires `APPLE_CLIENT_ID`; returns 501 if not configured, 401 if the token is invalid/expired.

---

## Researchers

### GET /api/researchers/search?q=name
No auth required. Searches Semantic Scholar by name and returns lightweight candidates for disambiguation (multiple people can share a name).
200 → `{ candidates: [{ semanticScholarId, name, affiliations, paperCount, citationCount, hIndex }, ...] }`
400 if `q` is missing or under 2 characters.

### POST /api/researchers
Auth required. Body: `{ semanticScholarId }`
Fetches the author from Semantic Scholar, recalculates H-index from raw citation counts, stores/updates the researcher + full paper snapshot, and appends an H-index history point.
201 → `{ researcher }`
404 if the Semantic Scholar ID doesn't exist. 429 if Semantic Scholar's rate limit is hit (auto-retried once internally).

### GET /api/researchers/:id
Auth required, must own the researcher. Add `?refresh=true` to re-fetch from Semantic Scholar before returning (otherwise returns the last stored snapshot).
200 → `{ researcher, history }` — `history` is the array of past H-index snapshots for charting.

### GET /api/researchers/:id/papers
Auth required, must own the researcher.
200 → `{ papers: [{ id, title, year, citations, venue }, ...] }`, sorted by citations descending.

### GET /api/researchers/:id/actions
Auth required, must own the researcher.
200 → `{ actionItems: [{ type, priority, title, description }, ...] }`, sorted by priority (high → info).

---

## Predictions

### POST /api/predictions
Auth required. Body:
```json
{
  "researcherId": "uuid",
  "targetH": 20,
  "monthlyCitationRate": 0.5,
  "papersPerYear": 2
}
```
- `monthlyCitationRate` — average citations gained per paper per month
- `papersPerYear` — rate of new papers published

201 → `{ prediction, projection }`. `projection.estimatedMonths` is `null` if the target isn't reached within the 20-year simulation cap; `projection.path` is a month-by-month array of `{ month, hIndex, totalCitations }` for charting.

---

## Errors

All errors return `{ "error": "message" }` with an appropriate HTTP status (400 validation, 401 auth, 403 ownership, 404 not found, 429 rate limited, 500 server error).
