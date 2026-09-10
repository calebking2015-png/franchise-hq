/**
 * Projection helpers: raw Sleeper stat lines → points under each league's scoring.
 * Pure functions; nothing here invents a number when a projection is missing.
 */
import { scoreStatLine } from "@/lib/scoring/engine";
import type { LeagueBundle } from "@/lib/portfolio/types";
import type { PlayerMap, ProjectionMap, StatsMap } from "@/lib/sleeper/types";
import { gameFor, hasStarted, isFinal, type ScheduleMap } from "@/lib/schedule";

/** Projected points for one player in one league, or null if no projection exists. */
export function projectPlayer(pid: string, b: LeagueBundle, players: PlayerMap, proj: ProjectionMap): number | null {
  const pr = proj[pid];
  const p = players[pid];
  if (!pr || !p) return null;
  return scoreStatLine(pr.stats, b.league.scoring_settings ?? {}, p.pos).points;
}

/** Everything needed to decide whether a player has real points yet. */
export interface LiveCtx { stats: StatsMap | null | undefined; schedule: ScheduleMap | null | undefined }

/**
 * Actual points for a player this week, or null if his game hasn't started.
 * Prefers Sleeper's live stats feed scored under the league's settings (it updates in-game); falls
 * back to the matchup feed's per-starter points, which lag by several minutes.
 */
export function actualPoints(pid: string, b: LeagueBundle, players: PlayerMap, ctx: LiveCtx | undefined, fallback?: number): number | null {
  const p = players[pid];
  if (!p) return null;
  const g = gameFor(ctx?.schedule, p.team, b.week);
  const line = ctx?.stats?.[pid];
  const scored = line ? scoreStatLine(line, b.league.scoring_settings ?? {}, p.pos).points : null;
  const official = typeof fallback === "number" && fallback !== 0 ? fallback : null;
  if (!hasStarted(g)) return official ?? (scored ? scored : null); // no schedule/status yet: trust any nonzero feed
  if (isFinal(g) && official != null) return official;            // game over: Sleeper's official number wins
  return scored ?? official ?? 0;                                  // in progress: live feed, else matchup feed
}

export interface LineupProjection {
  total: number;
  /** Projected points for each starter slot (null = no projection / empty slot). */
  perStarter: (number | null)[];
  /** Starters with no projection at all (bye, inactive, empty slot) — shown so the total is honest. */
  missing: number;
  /** Starters whose game hasn't produced points yet (proj still counts). */
  remaining: number;
}

/** Sum projections over a starter list. Once a starter has actual points, actuals replace the projection. */
export function projectStarters(starters: string[], actual: number[], b: LeagueBundle, players: PlayerMap, proj: ProjectionMap, live?: LiveCtx): LineupProjection {
  let total = 0, missing = 0, remaining = 0;
  const perStarter = starters.map((pid, i) => {
    if (!pid || pid === "0") { missing++; return null; }
    const pts = actualPoints(pid, b, players, live, actual[i]);
    if (pts != null) { total += pts; return pts; }
    const pr = projectPlayer(pid, b, players, proj);
    if (pr == null) { missing++; return null; }
    total += pr; remaining++;
    return pr;
  });
  return { total: Math.round(total * 100) / 100, perStarter, missing, remaining };
}

export interface MatchupProjection {
  mine: LineupProjection;
  opp: LineupProjection | null;
  margin: number | null; // mine − opp
}

export function projectMatchup(b: LeagueBundle, players: PlayerMap, proj: ProjectionMap, live?: LiveCtx): MatchupProjection | null {
  const m = b.matchup;
  if (!m) return null;
  const mine = projectStarters(m.myStarters, m.myStarterPoints, b, players, proj, live);
  const opp = m.oppRosterId != null ? projectStarters(m.oppStarters, m.oppStarterPoints, b, players, proj, live) : null;
  return { mine, opp, margin: opp ? Math.round((mine.total - opp.total) * 100) / 100 : null };
}

/** Opponent abbreviation for a player's game this week ("@KC" / "vs DEN"), or null. */
export function opponentLabel(pid: string, proj: ProjectionMap): string | null {
  const pr = proj[pid];
  return pr?.opp ? pr.opp : null;
}
