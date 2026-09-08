/**
 * Lineup optimizer + waiver suggestions. Both are driven purely by the week's projections
 * scored under the league's own settings; nothing is recommended without a number behind it.
 *
 * Optimizer: fills the league's starting slots to maximize projected points. Dedicated slots
 * (QB/RB/WR/TE/K/DEF) are filled first, then the narrow flexes, then FLEX, then SUPER_FLEX —
 * an exact search over ~10 slots × ~16 candidates finishes instantly, so we do it properly.
 */
import type { LeagueBundle, Portfolio } from "@/lib/portfolio/types";
import type { PlayerMap, ProjectionMap } from "@/lib/sleeper/types";
import { slotAccepts, startingSlots } from "@/lib/league/format";
import { isHardOut } from "./alerts";
import { projectPlayer } from "@/lib/projections";
import { gameFor, hasStarted, type ScheduleMap } from "@/lib/schedule";

export interface Assignment { slot: string; playerId: string | null; proj: number }

export interface OptimalLineup {
  slots: Assignment[];
  total: number;
  /** Projected total of the lineup currently set in Sleeper. */
  currentTotal: number;
  gain: number;
  /** Players to move in / out — the actionable part. */
  swaps: Swap[];
  /** Current starters with no projection (bye / inactive) — the reason many swaps exist. */
  zeroStarters: string[];
  /** Players who stay in the lineup but change slot to make room (e.g. Godwin FLEX → WR). */
  reshuffles: { playerId: string; from: string; to: string }[];
}

export interface Swap {
  slot: string;
  out: string | null; // current starter in that slot (null = empty)
  in: string;         // recommended
  gain: number;       // proj(in) − proj(out)
  reason: string;
}

/** Roster players who can legally start: not IR, not taxi, not hard-out. */
export function eligiblePool(b: LeagueBundle, players: PlayerMap) {
  const r = b.myRoster;
  if (!r) return [] as string[];
  const excluded = new Set([...(r.reserve ?? []), ...(r.taxi ?? [])]);
  return (r.players ?? []).filter((id) => !excluded.has(id) && players[id] && !isHardOut(players[id]));
}

/** Exact max-weight assignment via depth-first search with an optimistic bound (sizes are tiny). */
function solve(slots: string[], cands: { id: string; pos: string; proj: number }[]): (string | null)[] {
  const sorted = [...cands].sort((a, b) => b.proj - a.proj);
  // Per slot: indices into `sorted` that are eligible, already in descending projection order.
  const elig = slots.map((s) => sorted.map((c, i) => (slotAccepts(s, c.pos) ? i : -1)).filter((i) => i >= 0));
  // Most-restrictive slots first so the search prunes hard.
  const order = slots.map((_, i) => i).sort((a, b) => elig[a].length - elig[b].length);
  const used: boolean[] = new Array(sorted.length).fill(false);
  const pick: number[] = new Array(slots.length).fill(-1);
  let bestTotal = -1; let bestPick: number[] = [];
  const bound = (k: number) => { let t = 0; for (let j = k; j < order.length; j++) { for (const i of elig[order[j]]) if (!used[i]) { t += sorted[i].proj; break; } } return t; };
  const dfs = (k: number, total: number) => {
    if (total + bound(k) <= bestTotal) return;
    if (k === order.length) { bestTotal = total; bestPick = [...pick]; return; }
    const si = order[k];
    let any = false;
    for (const i of elig[si]) {
      if (used[i]) continue;
      any = true; used[i] = true; pick[si] = i;
      dfs(k + 1, total + sorted[i].proj);
      used[i] = false; pick[si] = -1;
    }
    if (!any) dfs(k + 1, total);
  };
  dfs(0, 0);
  return bestPick.map((i) => (i >= 0 ? sorted[i].id : null));
}

/**
 * @param locked player ids whose NFL game has kicked off. Locked starters stay where they are;
 *               locked bench players can't come in. Pass nothing to get the unconstrained optimum.
 */
export function optimalLineup(b: LeagueBundle, players: PlayerMap, proj: ProjectionMap, locked?: Set<string>): OptimalLineup | null {
  const r = b.myRoster;
  if (!r) return null;
  const slots = startingSlots(b.league);
  const current = r.starters ?? [];
  const pool = eligiblePool(b, players);
  const pj = (id: string | null | undefined) => (id && id !== "0" ? projectPlayer(id, b, players, proj) ?? 0 : 0);

  // Fix locked starters in their current slots and solve only the open slots.
  const fixed = new Map<number, string>();
  if (locked?.size) current.forEach((id, i) => { if (id && id !== "0" && locked.has(id)) fixed.set(i, id); });
  const openIdx = slots.map((_, i) => i).filter((i) => !fixed.has(i));
  const cands = pool.filter((id) => !locked?.has(id)).map((id) => ({ id, pos: players[id].pos, proj: pj(id) }));
  const solved = solve(openIdx.map((i) => slots[i]), cands);
  const pick: (string | null)[] = slots.map((_, i) => fixed.get(i) ?? null);
  openIdx.forEach((i, k) => { pick[i] = solved[k]; });

  // Keep players in their current slots wherever it's legal: the solver treats equivalent
  // assignments as interchangeable, so without this Chase and Olave would "move" WR↔FLEX for no gain.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < slots.length; i++) {
      const id = pick[i];
      if (!id || fixed.has(i)) continue;
      const home = current.indexOf(id); // slot this player is in right now
      if (home < 0 || home === i || fixed.has(home)) continue;
      const other = pick[home];
      // Swap if the player sitting in his old slot can legally take the slot we gave him.
      if (slotAccepts(slots[home], players[id].pos) && (!other || slotAccepts(slots[i], players[other].pos))) {
        pick[home] = id; pick[i] = other; changed = true;
      }
    }
  }

  const assigned = slots.map((slot, i) => ({ slot, playerId: pick[i], proj: pj(pick[i]) }));
  const total = assigned.reduce((n, a) => n + a.proj, 0);
  const currentTotal = current.reduce((n, id) => n + pj(id), 0);

  // Swaps: anyone recommended who isn't currently starting, paired with the current starter he displaces.
  const currentSet = new Set(current.filter((id) => id && id !== "0"));
  const recSet = new Set(assigned.map((a) => a.playerId).filter(Boolean) as string[]);
  const incoming = assigned.filter((a) => a.playerId && !currentSet.has(a.playerId));
  const outgoing = current.map((id, i) => ({ id: id && id !== "0" ? id : null, slot: slots[i] })).filter((x) => !x.id || !recSet.has(x.id));
  const swaps: Swap[] = [];
  const outLeft = [...outgoing].sort((a, b) => pj(a.id) - pj(b.id));
  for (const a of incoming.sort((x, y) => y.proj - x.proj)) {
    // Pair with the weakest displaced starter whose slot the newcomer could reasonably fill, else any.
    let idx = outLeft.findIndex((o) => slotAccepts(o.slot, players[a.playerId!].pos) || slotAccepts(a.slot, o.id ? players[o.id].pos : ""));
    if (idx < 0) idx = 0;
    const o = outLeft.splice(idx, 1)[0];
    const out = o?.id ?? null;
    const gain = a.proj - pj(out);
    const op = out ? players[out] : undefined;
    const reason = !out ? "Slot is empty" : isHardOut(op) ? `${op?.name} is ${op?.injury ?? op?.status}` : pj(out) === 0 ? `${op?.name} has no projection (bye/inactive)` : `${op?.name} projects ${pj(out).toFixed(1)}`;
    swaps.push({ slot: a.slot, out, in: a.playerId!, gain: Math.round(gain * 10) / 10, reason });
  }
  const reshuffles: { playerId: string; from: string; to: string }[] = [];
  current.forEach((id, i) => {
    if (!id || id === "0" || !recSet.has(id)) return;
    const j = assigned.findIndex((a) => a.playerId === id);
    if (j >= 0 && slots[j] !== slots[i]) reshuffles.push({ playerId: id, from: slots[i], to: slots[j] });
  });

  return {
    slots: assigned,
    reshuffles,
    total: Math.round(total * 100) / 100,
    currentTotal: Math.round(currentTotal * 100) / 100,
    gain: Math.round((total - currentTotal) * 10) / 10,
    swaps: swaps.filter((s) => s.gain > 0.05).sort((a, b) => b.gain - a.gain),
    zeroStarters: current.filter((id) => id && id !== "0" && pj(id) === 0),
  };
}

/* ---------------- Waivers ---------------- */

export interface Pickup {
  leagueId: string;
  leagueName: string;
  add: string;
  addProj: number;
  /** Suggested drop: the rostered, non-IR player who contributes least to the optimal lineup. */
  drop: string | null;
  dropProj: number;
  /** Increase in the league's optimal projected lineup if you make the move. */
  lineupGain: number;
  trendingAdds: number;
  faab: number | null;
}

/**
 * Free agents who would raise this week's optimal lineup. For each position the league starts,
 * take the top projected free agents, simulate add + drop of your least valuable bench body, re-optimize.
 */
export function waiverPickups(b: LeagueBundle, players: PlayerMap, proj: ProjectionMap, trending: { player_id: string; count: number }[], perPos = 3, locked?: Set<string>): Pickup[] {
  const r = b.myRoster;
  if (!r) return [];
  const base = optimalLineup(b, players, proj, locked);
  if (!base) return [];
  const starting = new Set(base.slots.map((s) => s.playerId).filter(Boolean) as string[]);
  const slots = startingSlots(b.league);
  const startsPos = (pos: string) => slots.some((s) => slotAccepts(s, pos));
  const trend = new Map(trending.map((t) => [t.player_id, t.count]));
  const pj = (id: string) => projectPlayer(id, b, players, proj) ?? 0;

  // Drop candidates: rostered, not IR/taxi, not in the optimal lineup; lowest projection first.
  const excluded = new Set([...(r.reserve ?? []), ...(r.taxi ?? [])]);
  const bench = (r.players ?? []).filter((id) => !excluded.has(id) && !starting.has(id) && players[id]);
  const dropOrder = [...bench].sort((a, c) => pj(a) - pj(c));

  // Free agents with a projection, grouped by position.
  const fas = Object.keys(proj).filter((id) => !b.ownership[id] && players[id]?.team && !isHardOut(players[id]) && startsPos(players[id].pos));
  const byPos = new Map<string, string[]>();
  for (const id of fas) byPos.set(players[id].pos, [...(byPos.get(players[id].pos) ?? []), id]);

  const out: Pickup[] = [];
  for (const [, ids] of byPos) {
    for (const add of ids.sort((a, c) => pj(c) - pj(a)).slice(0, perPos)) {
      if (dropOrder.length === 0 && (r.players?.length ?? 0) > 0) break;
      const drop = dropOrder[0] ?? null;
      const simRoster = { ...r, players: [...(r.players ?? []).filter((id) => id !== drop), add] };
      const sim = optimalLineup({ ...b, myRoster: simRoster }, players, proj, locked);
      const gain = sim ? Math.round((sim.total - base.total) * 10) / 10 : 0;
      if (gain < 1) continue;
      out.push({ leagueId: b.league.league_id, leagueName: b.league.name, add, addProj: pj(add), drop, dropProj: drop ? pj(drop) : 0, lineupGain: gain, trendingAdds: trend.get(add) ?? 0, faab: b.format.faabBudget });
    }
  }
  return out.sort((a, c) => c.lineupGain - a.lineupGain);
}

/** Ids of rostered players whose game this week has already kicked off (needs the schedule). */
export function lockedPlayers(b: LeagueBundle, players: PlayerMap, schedule: ScheduleMap | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!schedule) return out;
  for (const id of b.myRoster?.players ?? []) {
    const g = gameFor(schedule, players[id]?.team, b.week);
    if (hasStarted(g)) out.add(id);
  }
  return out;
}

export function allMoves(p: Portfolio, players: PlayerMap, proj: ProjectionMap, trending: { player_id: string; count: number }[], schedule?: ScheduleMap | null) {
  return p.leagues.map((b) => {
    const locked = lockedPlayers(b, players, schedule);
    return { b, locked, lineup: optimalLineup(b, players, proj, locked), pickups: waiverPickups(b, players, proj, trending, 3, locked) };
  });
}
