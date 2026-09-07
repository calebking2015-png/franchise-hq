# Franchise HQ

One command center for every Sleeper fantasy football league you're in. Read-only: it analyzes and recommends; you make the moves in the Sleeper app.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Default Sleeper username is `Poppysavage` (`.env.local`, or change it in Settings inside the app).

Production: `npm run build && npm start`. Deploys to Netlify (Next.js runtime) or Vercel as-is. API routes need a server runtime (not a static export) because they cache and trim Sleeper's 5 MB player dump.

## What's here (Phase 1)

- **Command Center** — portfolio stats, Needs Attention (empty slots, OUT/IR/SUS starters, IR housekeeping, Doubtful/Questionable), watch list, waiver radar, league cards
- **Leagues / League Hub** — roster, live matchup, standings, trending adds available, transactions, traded picks (dynasty), roster + scoring settings
- **Lineups** — every starting lineup with bench/IR/taxi and flags
- **Waivers** — Sleeper trending adds × availability in each league × your positional depth; drops you own
- **Portfolio** — player exposure, NFL team exposure, position totals, concentration + injury warnings
- **Players** — search, universal player page with owned / available / owned-by-others per league
- **Matchups** — projected totals and margin per league (Sleeper/Rotowire projections scored under each league's settings), live scores replace projections as games finish
- **Moves** — start/sit swaps (exact lineup optimizer over each league's slots) and waiver pickups that raise the projected lineup, with a suggested drop
- **Rooting** — Root for / Root against / Neutral: every player starting for or against you this week, weighted by projected points, rolled up to NFL teams
- **Dynasty** — roster age + taxi (only appears when you have a dynasty league)
- **Trades / Settings** — provider status; trade tools arrive in Phase 3

## Architecture

```
src/lib/sleeper      Sleeper types + read-only client (documented endpoints only, cached)
src/lib/providers    Pluggable provider interfaces: projection, ranking, schedule,
                     dynasty value, news, betting — all "not configured" until wired
src/lib/scoring      League-specific scoring engine (reads scoring_settings, TE premium, bonuses)
src/lib/league       Format detection: dynasty/redraft, SF, PPR, FAAB, slot eligibility
src/lib/analysis     Alerts, exposure, waiver radar, summaries — pure functions
src/lib/portfolio    Normalized Portfolio model + server-side assembly
src/app/api/sleeper  Route handlers: /portfolio, /players (trimmed, 24h cache), /trending, /league, /projections
src/lib/projections  Stat-line projections → points under each league's scoring; lineup + matchup totals
src/components       ui primitives, app shell, fantasy components
fixtures/            Dev-only mock of Sleeper's API shape for offline UI testing
```

Nothing is fabricated: anything without a live provider renders "not configured".

## Offline UI testing

```bash
node fixtures/mock-sleeper.mjs &
SLEEPER_API_BASE=http://localhost:4010/v1 npm run dev
```

## Roadmap

Phase 2 (in progress): projections ✓, projected matchups ✓, rooting interests ✓, lineup optimizer + start/sit ✓, waiver pickups ✓ → kickoff times / Sunday Mode, betting lines, opponent-vs-position context.
Phase 3: dynasty values, pick inventory, contender/rebuilder, trade analyzer + finder.
Phase 4: AI assistant over the structured Portfolio model.
