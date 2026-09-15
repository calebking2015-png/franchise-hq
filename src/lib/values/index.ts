/**
 * Trade values from FantasyCalc (https://fantasycalc.com) — a free, format-aware API driven by
 * real trades across thousands of leagues. Values are format-specific, so each of your leagues
 * (redraft/dynasty, 1QB/Superflex, PPR/Half) gets its own value set. Nothing is scraped or scaled
 * by hand: we ask FantasyCalc for the exact format and use what it returns.
 */
import type { LeagueFormat } from "@/lib/league/format";

export interface Value {
  value: number;
  overallRank: number;
  posRank: number;
  redraftValue?: number;
}
export type ValueMap = Record<string, Value>; // by Sleeper player id

export interface FCPlayer {
  player: { sleeperId?: string; name: string; position: string; maybeTeam?: string };
  value: number; overallRank: number; positionRank: number; redraftValue?: number;
}

/** FantasyCalc query params for a league's format. It buckets ppr to {0, 0.5, 1} and teams/qbs. */
export function fcParams(f: LeagueFormat) {
  const ppr = f.ppr >= 0.75 ? 1 : f.ppr >= 0.25 ? 0.5 : 0;
  const numQbs = f.superflex ? 2 : 1;
  const numTeams = [8, 10, 12, 14, 16].reduce((best, n) => (Math.abs(n - (f.teams || 12)) < Math.abs(best - (f.teams || 12)) ? n : best), 12);
  return { isDynasty: f.isDynasty, numQbs, numTeams, ppr };
}
export function fcKey(f: LeagueFormat) {
  const p = fcParams(f);
  return `${p.isDynasty ? "dyn" : "red"}-${p.numQbs}qb-${p.numTeams}tm-${p.ppr}ppr`;
}

/** Build a value map keyed by Sleeper id from a FantasyCalc response. */
export function toValueMap(rows: FCPlayer[] | null): ValueMap {
  const out: ValueMap = {};
  for (const r of rows ?? []) {
    const id = r.player?.sleeperId;
    if (!id) continue;
    out[id] = { value: r.value, overallRank: r.overallRank, posRank: r.positionRank, redraftValue: r.redraftValue };
  }
  return out;
}

/** Sum trade value for a set of players. */
export function sideValue(ids: string[], values: ValueMap) {
  return ids.reduce((n, id) => n + (values[id]?.value ?? 0), 0);
}

export interface TradeEval {
  give: { id: string; value: number }[];
  get: { id: string; value: number }[];
  giveTotal: number;
  getTotal: number;
  diff: number;            // get − give (positive = you win value)
  pct: number;             // diff as % of the larger side
  verdict: "you win" | "fair" | "you lose";
}

/** Evaluate a proposed trade under one league's values. "Fair" = within 10% of the larger side. */
export function evalTrade(giveIds: string[], getIds: string[], values: ValueMap): TradeEval {
  const give = giveIds.map((id) => ({ id, value: values[id]?.value ?? 0 }));
  const get = getIds.map((id) => ({ id, value: values[id]?.value ?? 0 }));
  const giveTotal = give.reduce((n, x) => n + x.value, 0);
  const getTotal = get.reduce((n, x) => n + x.value, 0);
  const diff = getTotal - giveTotal;
  const larger = Math.max(giveTotal, getTotal, 1);
  const pct = Math.round((diff / larger) * 100);
  const verdict = Math.abs(pct) <= 10 ? "fair" : diff > 0 ? "you win" : "you lose";
  return { give, get, giveTotal, getTotal, diff, pct, verdict };
}

/* ---------------- Team value (computed locally from Sleeper rosters + public values) ---------------- */

export interface TeamValue {
  rosterId: number;
  teamName: string;
  ownerName: string;
  isMe: boolean;
  total: number;
  starters: number;   // value of current starters
  bench: number;      // value of the rest
  top: { id: string; value: number }[]; // most valuable pieces
  rank: number;
}

/**
 * Rank every team in a league by total roster trade value. Pure function over the rosters Sleeper
 * already gave us and FantasyCalc's public values — no account linking, nothing sent anywhere.
 */
export function leagueTeamValues(
  rosters: { roster_id: number; players?: string[] | null; starters?: string[] | null }[],
  teamMeta: { rosterId: number; teamName: string; ownerName: string }[],
  myRosterId: number | null,
  values: ValueMap,
): TeamValue[] {
  const meta = new Map(teamMeta.map((t) => [t.rosterId, t]));
  const out: TeamValue[] = rosters.map((r) => {
    const ids = r.players ?? [];
    const starters = new Set((r.starters ?? []).filter((x) => x && x !== "0"));
    const valued = ids.map((id) => ({ id, value: values[id]?.value ?? 0 }));
    const total = valued.reduce((n, x) => n + x.value, 0);
    const startVal = valued.filter((x) => starters.has(x.id)).reduce((n, x) => n + x.value, 0);
    const m = meta.get(r.roster_id);
    return {
      rosterId: r.roster_id,
      teamName: m?.teamName ?? `Team ${r.roster_id}`,
      ownerName: m?.ownerName ?? "",
      isMe: r.roster_id === myRosterId,
      total,
      starters: startVal,
      bench: total - startVal,
      top: valued.sort((a, b) => b.value - a.value).slice(0, 3),
      rank: 0,
    };
  });
  out.sort((a, b) => b.total - a.total);
  out.forEach((t, i) => (t.rank = i + 1));
  return out;
}
