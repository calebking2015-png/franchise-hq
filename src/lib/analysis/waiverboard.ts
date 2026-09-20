/**
 * Waiver board: rank the free agents actually available in each league by a blend of
 *   - this-week projection (does he help the lineup now?),
 *   - trending adds from Sleeper (is the market moving on him?),
 *   - FantasyCalc redraft value (is he worth a roster spot rest-of-season?),
 *   - your roster need at his position (do you even have room to start him?).
 *
 * FAAB guidance is a *range by tier*, scaled to your remaining budget — never a fake-precise dollar
 * amount, because real FAAB depends on your leaguemates' budgets and how badly you need him, which
 * no API can know. All inputs are already loaded elsewhere in the app.
 */
import type { LeagueBundle } from "@/lib/portfolio/types";
import type { PlayerMap, ProjectionMap } from "@/lib/sleeper/types";
import type { ValueMap } from "@/lib/values";
import { projectPlayer } from "@/lib/projections";
import { isHardOut } from "./alerts";
import { positionalDepth } from "./exposure";
import { slotAccepts, startingSlots } from "@/lib/league/format";

export type Tier = "priority" | "solid" | "speculative" | "stash";

export interface WaiverTarget {
  playerId: string;
  pos: string;
  proj: number | null;
  value: number;          // FantasyCalc redraft value
  trendAdds: number;
  fillsNeed: boolean;     // you're thin at his position
  lineupGain: number;     // projected points added if you start him over your worst startable
  score: number;          // blended ranking score
  tier: Tier;
  faab: { lo: number; hi: number } | null;  // % of remaining budget, or null for non-FAAB
  faabDollars: { lo: number; hi: number } | null;
  drop: string | null;    // suggested drop
  reason: string;
}

const POS = ["QB", "RB", "WR", "TE", "K", "DEF"];

/** Blended score in 0..100-ish; weights favor real lineup help, then value, then buzz. */
function scoreOf(x: { proj: number; value: number; trend: number; need: boolean; gain: number }, maxVal: number) {
  const projPart = Math.min(x.proj / 22, 1) * 38;              // startable projection
  const valPart = maxVal ? (x.value / maxVal) * 30 : 0;        // up to 30 for ROS value
  const trendPart = Math.min(x.trend / 20000, 1) * 15;         // up to 15 for market buzz
  const gainPart = Math.min(Math.max(x.gain, 0) / 8, 1) * 15;  // up to 15 for actual lineup upgrade
  return projPart + valPart + trendPart + gainPart + (x.need ? 4 : 0);
}

function tierOf(score: number, gain: number, pos: string): Tier {
  const stream = pos === "K" || pos === "DEF";
  if (!stream && (score >= 55 || gain >= 4)) return "priority";
  if (stream && score >= 60) return "solid"; // kickers/defenses never "priority"
  if (score >= 38) return "solid";
  if (score >= 22) return "speculative";
  return "stash";
}

/** FAAB range as % of REMAINING budget, by tier. Ranges, never point values. */
const FAAB_PCT: Record<Tier, [number, number]> = {
  priority: [25, 45],
  solid: [8, 18],
  speculative: [2, 6],
  stash: [0, 2],
};

export function waiverBoard(
  b: LeagueBundle,
  players: PlayerMap,
  proj: ProjectionMap,
  values: ValueMap,
  trending: { player_id: string; count: number }[],
  limit = 15,
): WaiverTarget[] {
  if (!b.myRoster) return [];
  const trend = new Map(trending.map((t) => [t.player_id, t.count]));
  const slots = startingSlots(b.league);
  const startsPos = (pos: string) => slots.some((s) => slotAccepts(s, pos));
  const maxVal = Math.max(1, ...Object.values(values).map((v) => v.redraftValue ?? v.value));

  // Available = not owned by anyone in this league, has an NFL team, not hard-out, plays a started pos.
  const available = Object.keys(players).filter(
    (id) => !b.ownership[id] && players[id]?.team && !isHardOut(players[id]) && POS.includes(players[id].pos) && startsPos(players[id].pos),
  );

  // My weakest startable per position, to compute a realistic lineup gain.
  const myWorstStarter = (pos: string) => {
    const ids = (b.myRoster!.starters ?? []).filter((id) => id && id !== "0" && players[id]?.pos === pos);
    const scored = ids.map((id) => ({ id, p: projectPlayer(id, b, players, proj) ?? 0 })).sort((a, c) => a.p - c.p);
    return scored[0]?.p ?? 0;
  };

  const budgetLeft = b.format.faabBudget != null ? Math.max(0, b.format.faabBudget - (b.teams.find((t) => t.rosterId === b.myRosterId)?.faabUsed ?? 0)) : null;

  const rows: WaiverTarget[] = [];
  for (const id of available) {
    const p = players[id];
    const pr = projectPlayer(id, b, players, proj);
    const value = values[id]?.redraftValue ?? values[id]?.value ?? 0;
    const adds = trend.get(id) ?? 0;
    // Skip total noise: no projection, no value, not trending.
    if ((pr ?? 0) < 3 && value < maxVal * 0.05 && adds < 500) continue;
    const depth = positionalDepth(b, players, p.pos);
    const fillsNeed = depth.healthy <= depth.starterSlots;
    const gain = Math.max(0, (pr ?? 0) - myWorstStarter(p.pos));
    const score = scoreOf({ proj: pr ?? 0, value, trend: adds, need: fillsNeed, gain }, maxVal);
    const tier = tierOf(score, gain, p.pos);
    const faab = budgetLeft != null ? { lo: FAAB_PCT[tier][0], hi: FAAB_PCT[tier][1] } : null;
    const faabDollars = faab && budgetLeft != null ? { lo: Math.max(tier === "stash" ? 0 : 1, Math.round((faab.lo / 100) * budgetLeft)), hi: Math.max(1, Math.round((faab.hi / 100) * budgetLeft)) } : null;
    rows.push({
      playerId: id, pos: p.pos, proj: pr, value, trendAdds: adds, fillsNeed,
      lineupGain: Math.round(gain * 10) / 10, score: Math.round(score), tier, faab, faabDollars,
      drop: null,
      reason: [
        fillsNeed ? `fills a thin ${p.pos}` : null,
        gain >= 2 ? `+${gain.toFixed(1)} to your lineup` : null,
        adds >= 3000 ? `${adds.toLocaleString()} adds this week` : null,
        value >= maxVal * 0.15 ? "rest-of-season value" : null,
      ].filter(Boolean).join(" · ") || "depth add",
    });
  }
  rows.sort((a, c) => c.score - a.score);
  // Keep the board useful: at most 4 of any one position in the top list (streamers shouldn't drown it).
  const perPosCap = 4;
  const seen: Record<string, number> = {};
  const capped = rows.filter((r) => { seen[r.pos] = (seen[r.pos] ?? 0) + 1; return seen[r.pos] <= perPosCap; });
  rows.length = 0; rows.push(...capped);
  // Suggested drop: your lowest-value bench body (only meaningful for the top adds).
  const bench = (b.myRoster.players ?? []).filter((id) => !(b.myRoster!.starters ?? []).includes(id) && !(b.myRoster!.reserve ?? []).includes(id) && players[id]);
  const worstBench = bench.map((id) => ({ id, v: values[id]?.redraftValue ?? values[id]?.value ?? 0 })).sort((a, c) => a.v - c.v)[0]?.id ?? null;
  return rows.slice(0, limit).map((r) => ({ ...r, drop: worstBench }));
}
