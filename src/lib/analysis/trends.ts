/**
 * Buy-low / sell-high / hold engine.
 *
 * The core idea: compare what a player has actually scored against what he was expected to score,
 * and — crucially — judge whether the gap is driven by sticky things (volume, role) or flukey ones
 * (touchdown rate, a couple of long plays). Volume-driven underperformers are buy-low; TD-driven
 * overperformers are sell-high; everyone else holds.
 *
 * Everything here is derived from data already in the app (weekly projections + weekly actual stats
 * + Golden Boy TD%). Nothing is invented, and — importantly — confidence scales with sample size,
 * so early in the season the engine reports signals softly and only firms into verdicts once a few
 * weeks exist. One week is mostly noise and the labels say so.
 */
import type { LeagueBundle, Portfolio } from "@/lib/portfolio/types";
import type { PlayerMap, ProjectionMap, StatsMap } from "@/lib/sleeper/types";
import { scoreStatLine } from "@/lib/scoring/engine";
import { isHardOut } from "./alerts";

export type Verdict = "buy-low" | "sell-high" | "hold";
export type Confidence = "low" | "medium" | "high";

export interface WeekLine {
  week: number;
  actual: number | null;   // scored (league scoring)
  projected: number | null;
  /** Share of the week's points that came from TDs — the flukiest input. */
  tdShare: number | null;
  /** Opportunity: targets + carries that week. */
  opportunity: number | null;
}

export interface Trend {
  playerId: string;
  pos: string;
  games: number;
  /** Mean actual − projected per game (league scoring). Positive = running hot. */
  ptsOverExpected: number;
  /** Average points per game so far. */
  ppg: number;
  /** Average weekly opportunity (targets + carries). */
  opportunity: number;
  /** Golden Boy anytime-TD probability, if available. */
  tdPct: number | null;
  /** Share of season points from TDs — high means the scoring is TD-dependent. */
  tdReliance: number;
  verdict: Verdict;
  confidence: Confidence;
  /** One-line human reason. */
  reason: string;
  weeks: WeekLine[];
  mine: { leagueId: string; leagueName: string }[];
}

const TD_KEYS = ["pass_td", "rush_td", "rec_td"];
function tdPoints(stats: Record<string, number>, scoring: Record<string, number>) {
  let t = 0;
  for (const k of TD_KEYS) if (stats[k]) t += stats[k] * (scoring[k] ?? (k === "pass_td" ? 4 : 6));
  return t;
}
function opportunity(stats: Record<string, number>) {
  return (stats.rec_tgt ?? 0) + (stats.rush_att ?? 0);
}

export interface TrendInputs {
  /** week → actual stats map for that week */
  weekly: Record<number, StatsMap>;
  /** week → projections map for that week (may only have current week; older weeks optional) */
  projByWeek: Record<number, ProjectionMap>;
  tdPct: Record<string, number>;
  throughWeek: number;
}

/** Build trend rows for every rostered skill player across the portfolio. */
export function buildTrends(p: Portfolio, players: PlayerMap, input: TrendInputs): Trend[] {
  // Which leagues roster each player (for scoring context + "mine" chips). First league sets scoring.
  const rosteredIn = new Map<string, { b: LeagueBundle }[]>();
  for (const b of p.leagues) for (const id of b.myRoster?.players ?? []) {
    if (!["QB", "RB", "WR", "TE"].includes(players[id]?.pos)) continue;
    rosteredIn.set(id, [...(rosteredIn.get(id) ?? []), { b }]);
  }

  const out: Trend[] = [];
  for (const [id, where] of rosteredIn) {
    const p0 = players[id];
    const scoring = where[0].b.league.scoring_settings ?? {};
    const weeks: WeekLine[] = [];
    for (let w = 1; w <= input.throughWeek; w++) {
      const st = input.weekly[w]?.[id];
      const prStats = input.projByWeek[w]?.[id]?.stats;
      const played = st && (opportunity(st) > 0 || (st.pts_ppr ?? st.pts_half_ppr ?? st.pts_std) != null);
      const actual = played ? scoreStatLine(st, scoring, p0.pos).points : null;
      const projected = prStats ? scoreStatLine(prStats, scoring, p0.pos).points : null;
      const td = played ? tdPoints(st, scoring) : null;
      weeks.push({ week: w, actual, projected, tdShare: actual && actual > 0 && td != null ? td / actual : null, opportunity: played ? opportunity(st) : null });
    }
    const gp = weeks.filter((w) => w.actual != null);
    const games = gp.length;
    if (games === 0) continue;
    const ppg = gp.reduce((n, w) => n + (w.actual ?? 0), 0) / games;
    const withProj = gp.filter((w) => w.projected != null);
    const poe = withProj.length ? withProj.reduce((n, w) => n + ((w.actual ?? 0) - (w.projected ?? 0)), 0) / withProj.length : 0;
    const opp = gp.reduce((n, w) => n + (w.opportunity ?? 0), 0) / games;
    const totalPts = gp.reduce((n, w) => n + (w.actual ?? 0), 0);
    const totalTd = gp.reduce((n, w) => n + ((w.tdShare != null && w.actual != null) ? w.tdShare * w.actual : 0), 0);
    const tdReliance = totalPts > 0 ? totalTd / totalPts : 0;
    const tdPct = input.tdPct[id] ?? null;

    const confidence: Confidence = games >= 5 ? "high" : games >= 3 ? "medium" : "low";
    const { verdict, reason } = classify({ pos: p0.pos, poe, ppg, opp, tdReliance, tdPct, games });
    out.push({
      playerId: id, pos: p0.pos, games, ptsOverExpected: round(poe), ppg: round(ppg), opportunity: round(opp),
      tdPct, tdReliance: round(tdReliance), verdict, confidence, reason, weeks,
      mine: where.map(({ b }) => ({ leagueId: b.league.league_id, leagueName: b.league.name })),
    });
  }
  // Sort by how actionable: strongest buy-lows and sell-highs first, holds last.
  const rank = (t: Trend) => (t.verdict === "hold" ? 0 : Math.abs(t.ptsOverExpected) * (t.confidence === "high" ? 1.5 : t.confidence === "medium" ? 1 : 0.6));
  return out.sort((a, b) => rank(b) - rank(a));
}

const round = (n: number) => Math.round(n * 10) / 10;

/** The judgment. Volume separates real from fluke; TD reliance flags unsustainable hot streaks. */
function classify(x: { pos: string; poe: number; ppg: number; opp: number; tdReliance: number; tdPct: number | null; games: number }): { verdict: Verdict; reason: string } {
  const bigPoe = x.games >= 3 ? 3 : 4;          // require a wider gap on tiny samples
  const heavyTd = 0.45;                          // ~half the points from TDs is TD-dependent
  const goodVolume = x.pos === "RB" ? 14 : x.pos === "WR" ? 7 : x.pos === "TE" ? 5 : 0;

  // Overperforming: is it sticky (volume) or flukey (TDs)?
  if (x.poe >= bigPoe) {
    if (x.tdReliance >= heavyTd) return { verdict: "sell-high", reason: `Beating projection by ${x.poe.toFixed(1)}/gm, but ${Math.round(x.tdReliance * 100)}% of it is TDs — hard to sustain.` };
    if (x.opp < goodVolume && goodVolume) return { verdict: "sell-high", reason: `Scoring above expectation on modest volume (${x.opp.toFixed(0)} opp/gm) — regression risk.` };
    return { verdict: "hold", reason: `Outproducing projection by ${x.poe.toFixed(1)}/gm, and the volume backs it up.` };
  }
  // Underperforming: is the opportunity still there (buy-low) or gone (fade)?
  if (x.poe <= -bigPoe) {
    if (x.opp >= goodVolume && goodVolume) return { verdict: "buy-low", reason: `${x.poe.toFixed(1)}/gm under projection despite ${x.opp.toFixed(0)} opp/gm — points should follow the volume.` };
    if (x.tdPct != null && x.tdPct >= 0.4) return { verdict: "buy-low", reason: `Down ${Math.abs(x.poe).toFixed(1)}/gm but a strong TD outlook (${Math.round(x.tdPct * 100)}%) — positive regression coming.` };
    return { verdict: "hold", reason: `Below projection, but the opportunity isn't there yet to call it a buy.` };
  }
  return { verdict: "hold", reason: `Scoring about as expected (${x.poe >= 0 ? "+" : ""}${x.poe.toFixed(1)}/gm).` };
}
