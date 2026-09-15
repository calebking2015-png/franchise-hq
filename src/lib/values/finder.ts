/**
 * Redraft trade finder + balancer. Two related tools, both built only on data already loaded:
 * FantasyCalc redraft values, Sleeper rosters, and each league's starting-slot needs.
 *
 * Philosophy: for redraft, value = win-now (FantasyCalc's redraftValue). A "good" trade for you
 * either (a) upgrades a starting spot you're thin at, or (b) turns bench surplus into a starter
 * upgrade — while staying close to fair by value. Everything is a *candidate to investigate*: the
 * finder knows value and positional need, not your read on a matchup or who you personally rate.
 *
 * Dynasty leagues are intentionally excluded — win-now value is the wrong lens there.
 */
import type { LeagueBundle } from "@/lib/portfolio/types";
import type { PlayerMap } from "@/lib/sleeper/types";
import type { ValueMap } from "./index";
import { slotAccepts, startingSlots } from "@/lib/league/format";
import { isHardOut } from "@/lib/analysis/alerts";

/** Redraft value for a player (falls back to dynasty value if redraft missing). */
function rv(id: string, values: ValueMap) {
  const v = values[id];
  return v ? (v.redraftValue ?? v.value) : 0;
}

export interface Need {
  pos: string;
  starterSlots: number;
  /** Value of your current best starter at the position (worst startable, really). */
  weakestStarterValue: number;
  weakestStarterId: string | null;
  depth: number;      // healthy bodies at the position
  thin: boolean;      // at or below starter count
}

/** Where a team is thin (few startable bodies) vs deep (startable surplus on the bench). */
export function rosterNeeds(b: LeagueBundle, players: PlayerMap, values: ValueMap) {
  const roster = b.myRoster;
  const need: Record<string, Need> = {};
  const surplus: { id: string; pos: string; value: number }[] = [];
  if (!roster) return { need, surplus };
  const starters = new Set((roster.starters ?? []).filter((x) => x && x !== "0"));
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    const ids = (roster.players ?? []).filter((id) => players[id]?.pos === pos && !isHardOut(players[id]));
    const slots = startingSlots(b.league).filter((sl) => slotAccepts(sl, pos)).length;
    const dedicated = b.format.starters.filter((s) => s.slot === pos).reduce((n, s) => n + s.count, 0);
    const byVal = ids.map((id) => ({ id, v: rv(id, values) })).sort((a, c) => c.v - a.v);
    const startTargets = byVal.slice(0, Math.max(dedicated, 1));
    const weakest = startTargets[startTargets.length - 1] ?? null;
    need[pos] = {
      pos, starterSlots: dedicated,
      weakestStarterValue: weakest?.v ?? 0, weakestStarterId: weakest?.id ?? null,
      depth: ids.length, thin: ids.length <= dedicated,
    };
    // Surplus: bench players at this position beyond what you'd start, with real value.
    for (const { id, v } of byVal.slice(Math.max(dedicated, 1))) if (!starters.has(id) && v > 0) surplus.push({ id, pos, value: v });
  }
  return { need, surplus };
}

export interface TradeIdea {
  leagueId: string;
  leagueName: string;
  partnerRosterId: number;
  partnerName: string;
  give: { id: string; value: number }[];
  get: { id: string; value: number }[];
  giveValue: number;
  getValue: number;
  pct: number;              // value delta as % of larger side (you get − you give)
  /** Why this helps you: the starting upgrade it creates. */
  upgradePos: string;
  upgradeGain: number;      // redraft-value bump to your starting lineup at that position
  kind: "fill-need" | "cash-surplus";
  rationale: string;
}

/**
 * Find fair-ish redraft deals that upgrade one of your starting spots. For each partner team we look
 * for a player who beats your weakest starter at a position, and pay for him from your surplus +/- a
 * small piece, keeping the swap within ~12% by value.
 */
export function findTrades(b: LeagueBundle, players: PlayerMap, values: ValueMap, maxIdeas = 8): TradeIdea[] {
  if (b.format.isDynasty || !b.myRoster) return [];
  const { need, surplus } = rosterNeeds(b, players, values);
  const ideas: TradeIdea[] = [];
  const myStarters = new Set((b.myRoster.starters ?? []).filter((x) => x && x !== "0"));

  for (const partner of b.rosters) {
    if (partner.roster_id === b.myRosterId) continue;
    const meta = b.teams.find((t) => t.rosterId === partner.roster_id);
    const partnerStart = new Set((partner.starters ?? []).filter((x) => x && x !== "0"));
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      const n = need[pos];
      if (!n || !n.starterSlots) continue;
      // Their players at this pos who would upgrade my weakest starter by a meaningful margin.
      const targets = (partner.players ?? [])
        .filter((id) => players[id]?.pos === pos && !isHardOut(players[id]))
        .map((id) => ({ id, v: rv(id, values) }))
        .filter((x) => x.v > n.weakestStarterValue * 1.12 && x.v > 0)
        .sort((a, c) => c.v - a.v);

      for (const tgt of targets.slice(0, 2)) {
        // Build a realistic package for ONE target: prefer a single fair piece, allow at most two.
        // Never pile on scrubs — each piece must be a real chip, and we cap the count.
        const MAX_PIECES = 2;
        const minPiece = tgt.v * 0.2; // a piece worth <20% of the target is filler; skip it
        // Candidate givables: bench surplus (any pos) + the weakest starter being replaced.
        const givables = [
          ...surplus.filter((sp) => !myStarters.has(sp.id)).map((sp) => ({ id: sp.id, value: sp.value })),
          ...(n.weakestStarterId ? [{ id: n.weakestStarterId, value: n.weakestStarterValue }] : []),
        ].filter((g) => g.value >= minPiece).sort((a, c) => c.value - a.value);
        if (givables.length === 0) continue;

        // Try best single piece first (1-for-1), then best fair pair (2-for-1).
        let give: { id: string; value: number }[] | null = null;
        const within = (v: number) => Math.abs((tgt.v - v) / Math.max(tgt.v, v, 1)) <= 0.15;
        const single = givables.find((g) => within(g.value));
        if (single) give = [single];
        if (!give) {
          let best: { pair: { id: string; value: number }[]; d: number } | null = null;
          for (let i = 0; i < givables.length; i++) for (let j = i + 1; j < givables.length; j++) {
            const v = givables[i].value + givables[j].value;
            if (!within(v)) continue;
            const d = Math.abs(tgt.v - v);
            if (!best || d < best.d) best = { pair: [givables[i], givables[j]], d };
          }
          if (best) give = best.pair;
        }
        if (!give || give.length > MAX_PIECES) continue;
        const giveVal = give.reduce((acc, g) => acc + g.value, 0);
        const larger = Math.max(giveVal, tgt.v, 1);
        const pct = Math.round(((tgt.v - giveVal) / larger) * 100);
        if (Math.abs(pct) > 15) continue;
        const usedSurplusOnly = !give.find((g) => g.id === n.weakestStarterId);
        const upgradeGain = Math.round(tgt.v - n.weakestStarterValue);
        ideas.push({
          leagueId: b.league.league_id, leagueName: b.league.name,
          partnerRosterId: partner.roster_id, partnerName: meta?.teamName ?? `Team ${partner.roster_id}`,
          give, get: [{ id: tgt.id, value: tgt.v }],
          giveValue: Math.round(giveVal), getValue: Math.round(tgt.v), pct,
          upgradePos: pos, upgradeGain,
          kind: usedSurplusOnly ? "cash-surplus" : "fill-need",
          rationale: usedSurplusOnly
            ? `Turns ${pos} bench depth into a starting upgrade: ${players[tgt.id]?.name} over your ${players[n.weakestStarterId ?? ""]?.name ?? "current starter"} (+${upgradeGain} value).`
            : `Upgrades your ${pos}: ${players[tgt.id]?.name} in for ${players[n.weakestStarterId ?? ""]?.name ?? "your weakest starter"} (+${upgradeGain} value).`,
        });
      }
    }
  }
  // Best upgrades first, tie-break toward the fairest.
  return ideas
    .filter((v, i, arr) => arr.findIndex((x) => x.get[0].id === v.get[0].id && x.partnerRosterId === v.partnerRosterId) === i)
    .sort((a, c) => c.upgradeGain - a.upgradeGain || Math.abs(a.pct) - Math.abs(c.pct))
    .slice(0, maxIdeas);
}

/** Balancer: given a lopsided proposed trade, suggest add-ons from the short side to make it fair. */
export function balanceTrade(giveIds: string[], getIds: string[], values: ValueMap, pool: { mine: string[]; theirs: string[] }, players: PlayerMap): { addTo: "give" | "get"; suggestions: { id: string; value: number }[] } | null {
  const giveVal = giveIds.reduce((n, id) => n + rv(id, values), 0);
  const getVal = getIds.reduce((n, id) => n + rv(id, values), 0);
  const gap = Math.abs(getVal - giveVal);
  if (gap < Math.max(getVal, giveVal, 1) * 0.08) return null; // already fair
  const addTo = getVal > giveVal ? "give" : "get";            // short side needs to add
  const candidates = (addTo === "give" ? pool.mine : pool.theirs)
    .filter((id) => !giveIds.includes(id) && !getIds.includes(id) && players[id])
    .map((id) => ({ id, value: rv(id, values) }))
    .filter((x) => x.value > 0)
    .sort((a, c) => Math.abs(a.value - gap) - Math.abs(c.value - gap)) // closest single piece to the gap
    .slice(0, 4);
  return { addTo, suggestions: candidates };
}
