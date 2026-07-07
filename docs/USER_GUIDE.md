# User Guide

## 1. Explore with demo data (no signup required)
Open the app and click **"Use demo data"** on the search page. You'll see a sample researcher profile with 22 papers, an H-index history, and the full dashboard/predictor/action-items experience — a quick way to see what the tool does before connecting your own data.

## 2. Track your own H-index
1. Click **Sign up** (email/password, or Google/Apple if your instance has social sign-in configured).
2. On the Search page, just type your name — no need to look up an ID yourself. Semantic Scholar search runs automatically.
3. Since names aren't unique, you'll see a list of matching authors with affiliation, paper count, and citation count to help you tell them apart. Click the right one.
4. Your real papers and citation counts load into the dashboard. If you already know your numeric Semantic Scholar Author ID, you can paste that directly instead of a name to skip the disambiguation step.

## 3. Dashboard
Shows your current H-index, total citations, tracked paper count, and average citations per paper, plus a chart of H-index growth over time and a table of your top-cited papers. Click **Refresh from Semantic Scholar** any time to pull the latest citation counts.

## 4. Predictor
Set a target H-index, an estimated average monthly citation growth rate per paper, and how many new papers per year you expect to publish. The tool projects, month by month, when you'd reach that target under those assumptions — plus a chart of the projected path. This is a simple linear model, not a guarantee: actual citation accumulation is uneven and influenced by factors the model doesn't capture (venue prestige, field size, timing, etc.).

## 5. Action Items
Auto-generated, prioritized suggestions based on your current papers:
- **Near-miss papers** — papers just a few citations away from raising your H-index. Cheapest wins; consider sharing them or citing them in new work.
- **Low-citation papers** — papers with 0-1 citations that could benefit from more visibility or follow-up collaboration.
- **Publication cadence** — a flag if you've published fewer than 2 papers in the last 2 years.
- **Venue strategy** — a general reminder to prioritize high-impact venues for your strongest current work.

## FAQ

**Is my H-index the same as what's shown on Semantic Scholar?**
It should match closely — we recompute it directly from the same per-paper citation counts Semantic Scholar reports, rather than trusting their cached value, so it stays consistent with the papers list you see in the dashboard. Small differences can occur if Semantic Scholar's citation counts update between your last refresh and their site.

**Why didn't my prediction reach the target?**
The simulation caps at 20 years. If your target isn't reached in that window at the given growth rate, it reports "not reachable" rather than an arbitrarily large number — try increasing the citation growth rate or papers/year to see a feasible path.

**Can I track multiple researchers (e.g. my whole lab)?**
Not in this MVP — each user account currently surfaces the most recently looked-up researcher. Multi-researcher support is a natural next step (see the README's "Optional Enhancements").
