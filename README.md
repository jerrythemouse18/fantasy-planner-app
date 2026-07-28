# Fantasy Planner

A Fantasy Premier League (FPL) squad and fixture planner for the 2026/27 season.

**Live:** https://jerrythemouse18.github.io/fantasy-planner-app/

## Features

- **Squad Builder** — pick a 15-player squad from the real Premier League player list with FPL rules enforced live: £100.0m budget, 2 GKP / 5 DEF / 5 MID / 3 FWD, max 3 players per club. Filter and sort players by price, points, form, xGI, ICT, ownership, and value (points per £m). Squad persists in localStorage.
- **Best XI** — for any gameweek, ranks your 15 players with a transparent composite score and picks the highest-scoring valid formation (1 GK, 3–5 DEF, 2–5 MID, 1–3 FWD), plus a captain pick and ordered bench. Hover a score to see its breakdown.
- **Planner** — looks ahead 2–5 gameweeks from any starting week: suggests one free transfer per week (only when it clears a worthwhile-gain threshold), shows each week's best XI with the evolving squad, and recommends where in the window to play Triple Captain (best captain score), Bench Boost (strongest bench) and Free Hit (a week much weaker than the rest — usually blanks).
- **Fixtures** — full 38-gameweek season ticker (20 teams × 38 GWs, colour-coded by FPL's Fixture Difficulty Rating) and a per-gameweek match list with deadlines.

## Run locally

No build step. Serve the folder and open it:

```
python3 -m http.server 8000
# → http://localhost:8000
```

Tests (zero-dependency Node harness):

```
node test/run-tests.js
```

## Refreshing data

Player/fixture data is a snapshot vendored into `data/` (see decision log below). It refreshes automatically: a GitHub Action (`.github/workflows/refresh-data.yml`) runs daily at 06:00 UTC, re-fetches the FPL API, and commits the changed `data/*.js` files — GitHub Pages then redeploys, so the live site is never more than ~24h stale. The header shows the snapshot timestamp.

For an immediate refresh: run the workflow manually from the repo's **Actions** tab (it has a `workflow_dispatch` trigger), or locally:

```
python3 scripts/refresh_data.py
```

then commit the changed files.

## How the Best XI score works

Each player gets a **base score (0–100)**: a weighted blend of FPL metrics, each normalised against the best in the league:

| Metric | Weight | Why |
|---|---|---|
| Form | 0.30 | FPL's average points over the last 30 days — the strongest short-term signal |
| Points per game | 0.25 | Sustained output, less noisy than form |
| xGI per start | 0.20 | Expected goal involvements — underlying attacking threat, less luck-driven than actual returns |
| ICT index | 0.15 | FPL's influence/creativity/threat composite |
| Minutes | 0.10 | Rotation risk — players who don't play can't score |

Then two multipliers:

- **Fixture (FDR)** — the gameweek's Fixture Difficulty Rating for the player's team maps to a multiplier: FDR 2 → ×1.10, 3 → ×1.00, 4 → ×0.85, 5 → ×0.70. Blank gameweek → ×0 (player can't score). Double gameweek → multipliers sum (two fixtures ≈ double the chance of points).
- **Availability** — injured/suspended/unavailable → ×0; doubtful → ×(chance of playing), or ×0.75 if FPL hasn't given a percentage.

The best XI is found by trying every valid formation and taking the top-scoring players per position; the highest-total formation wins. Captain = highest-scoring starter.

## Architecture

Vanilla HTML/CSS/JS, no build step, no dependencies — same pattern as my other apps.

```
index.html          single page, 3 tabs
css/style.css
js/rules.js         FPL squad rules + validation (pure logic)
js/scoring.js       composite score + best-XI picker (pure logic)
js/storage.js       localStorage persistence (squad ids)
js/planner.js       multi-GW transfer plan + chip advice (pure logic)
js/fixtures.js      season ticker + gameweek detail rendering
js/app.js           tabs, squad builder UI, best-XI view
data/*.js           vendored FPL API snapshots (browser globals)
scripts/refresh_data.py   re-fetches snapshots from the FPL API
test/run-tests.js   zero-dep Node tests for rules.js + scoring.js
```

Deployed on GitHub Pages from `main`.

## Decision log

Decisions made so far, with what was considered and why — so future changes have the context.

### Data source: vendored snapshot (2026-07-28)
The FPL API (`https://fantasy.premierleague.com/api/`) is public and free but **blocks browser CORS**, so a static GitHub Pages app can't call it directly. Options considered:
1. **Vendored snapshot** ✅ — commit trimmed JSON-as-JS to `data/`, refresh via `scripts/refresh_data.py`. Always works, no third-party dependency; data goes stale between refreshes.
2. Live CORS proxy (e.g. corsproxy.io) — freshest data but app breaks if the proxy dies or rate-limits.
3. Hybrid (snapshot + live refresh attempt) — best of both but more code.

Chose (1) for reliability and simplicity. The snapshot date is shown in the header. Revisit if manual refreshing becomes a chore (hybrid is the natural upgrade).

**Update (2026-07-28):** user asked for an in-app "reload data" button. A browser-side reload would require routing traffic through a third-party CORS proxy — reopening the rejected option 2 — so instead the snapshot is now kept fresh automatically by a scheduled GitHub Action (daily 06:00 UTC + manual `workflow_dispatch`) that re-runs `scripts/refresh_data.py` and commits changes, auto-redeploying Pages. Snapshot-only architecture unchanged; staleness bounded at ~24h; on-demand refresh available from the Actions tab. A proxy-backed button remains possible later if deadline-day freshness matters.

### Best-XI ranking: composite score (2026-07-28)
Options considered:
1. **Composite score** ✅ — blend of form/PPG/xGI/ICT/minutes with FDR and availability multipliers. Transparent: every score decomposes into visible factors.
2. FPL's own `ep_next` (expected points) field — simplest, but a black box and only projects one GW ahead.
3. Configurable weight sliders — most flexible, more UI; can be added on top of (1) later.
4. Full optimizer/solver (linear programming, like sertalpbilal's FPL-Optimization-Tools) — the serious-tools approach, overkill for picking 11 from 15 (formation enumeration is exhaustive and instant at this size).

Chose (1). The weights are hand-picked priors, not fitted — documented above so they can be tuned with hindsight once the season produces data.

### Scope: what we deliberately skipped (2026-07-28)
Researched the existing app landscape (Fantasy Football Fix, LiveFPL, Fantasy Football Scout, FPL Review, Fantasy Football Hub, open-source solvers). Table-stakes features are: player stat table, fixture ticker, rate-my-team, projections, price-change info. Deliberately **not** building (well served free elsewhere, or premium-tier complexity):
- Live rank / effective ownership during gameweeks → LiveFPL does this free
- Price-change prediction → FPL Statistics / LiveFPL
- Points-projection models beyond the composite score → FPL Review's Massive Data is the community standard
- Transfer planning across multiple future gameweeks, chip strategy (wildcard/bench boost/etc. timing) — possible future feature
- Importing an existing FPL team by team ID — possible future feature (the entry API endpoint is public)

### Stack: vanilla static site (2026-07-28)
Same conventions as pokemon-champions-team-analyzer / mahjong-winning-hands / sg-bus-arrivals: no framework, no build, classic script tags with object-literal namespaces, localStorage, GitHub Pages from `main`, zero-dep Node test harness for pure logic.

### Dark theme (2026-07-28)
User asked for a dark UI (no white background). Single dark theme rather than a light/dark toggle — less surface area, and it's a personal app. FDR chip colours were re-derived for the dark surface and checked with the palette validator: green shades for easy (1–2), neutral dark gray for 3, salmon/red for hard (4–5). Adjacent FDR pairs pass colour-vision-deficiency separation except where the chip's text label already carries the value — every chip shows the opponent/difficulty as text, so colour never carries meaning alone.

### Squad interactions: row-click + over-budget drafting (2026-07-28)
- Player rows toggle squad membership on click (originally an Add/Remove button per row). Rows that can't be added (position full, 3-per-club) are dimmed with the reason in the tooltip.
- The £100m budget is **not** enforced at add time: user wanted to draft over budget and see the negative bank (shown red) while iterating. `Rules.validateSquad` still flags over-budget squads, so "✓ complete and valid" only appears within budget.

### Multi-gameweek planner + chip advice (2026-07-28)
User wanted to plan ahead using the weekly free transfer and the chips (Triple Captain, Bench Boost, Free Hit). Model chosen — greedy week-by-week, deliberately simple:
- **One free transfer per week, no point hits.** Each week the planner searches all same-position swaps (market pruned to top 40 per position by base score, injured/suspended excluded) and applies the one with the biggest summed composite-score gain over the *remaining* window — but only if it gains ≥ 3; otherwise "bank it". Budget uses bank + sale price at current prices (no price-change or sell-fee modelling).
- **Chip advice compares weeks within the window only**: Triple Captain → week with the highest captain score; Bench Boost → strongest 4-player bench; Free Hit → only flagged when a week's XI total drops below 85% of the window's best (blank-heavy or brutal fixtures), since a Free Hit squad is temporary.
- Alternatives considered: full multi-week optimization (MILP solver, like sertalpbilal's tools) — rejected for now as it needs a projection model and a solver dependency; hit-taking (-4) transfers — rejected to keep suggestions conservative; banking transfers to use 2+ in a later week — not modelled yet, a natural next step.
- Not modelled: wildcard advice (it rebuilds the whole squad — different problem), captaincy across double gameweeks beyond fixture-sum, price changes during the window, chips already used.

### Season-timing caveat (2026-07-28)
Until GW1 (deadline 21 Aug 2026), player stats in the snapshot are **last season's totals** and `form` is 0.0 — so pre-season Best XI rankings lean on points-per-game/xGI/ICT from 2025/26. Promoted clubs (Coventry, Hull, Ipswich) have no PL data. Rankings get meaningful from GW2 onwards; refresh the snapshot after each gameweek.

## Data notes

- Prices are integers in tenths of £m (`now_cost: 55` = £5.5m) — all budget math is integer to avoid float bugs.
- Many FPL numeric fields are strings (`form`, `ict_index`, `expected_*`) — parsed at use.
- FDR is 1–5 (5 hardest), asymmetric per fixture side; FPL rarely assigns 1.
- Postponed fixtures get `event: null` mid-season; they show as blanks until rescheduled.
