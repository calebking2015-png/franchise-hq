import type { LeagueBundle, Portfolio } from "@/lib/portfolio/types";
import type { PlayerMap } from "@/lib/sleeper/types";
import { startingSlots } from "@/lib/league/format";

export function myTeam(b: LeagueBundle) {
  return b.teams.find((t) => t.rosterId === b.myRosterId) ?? null;
}

export function opponentTeam(b: LeagueBundle) {
  return b.matchup?.oppRosterId != null ? b.teams.find((t) => t.rosterId === b.matchup!.oppRosterId) ?? null : null;
}

export function combinedRecord(p: Portfolio) {
  const r = { wins: 0, losses: 0, ties: 0 };
  for (const b of p.leagues) {
    const t = myTeam(b);
    if (!t) continue;
    r.wins += t.record.wins; r.losses += t.record.losses; r.ties += t.record.ties;
  }
  return r;
}

/** Live week record: only counted when the matchup has points on both sides. */
export function weekRecord(p: Portfolio) {
  const r = { winning: 0, losing: 0, tied: 0, pending: 0 };
  for (const b of p.leagues) {
    const m = b.matchup;
    if (!m || m.oppPoints == null) { r.pending++; continue; }
    if (m.myPoints === 0 && m.oppPoints === 0) { r.pending++; continue; }
    if (m.myPoints > m.oppPoints) r.winning++;
    else if (m.myPoints < m.oppPoints) r.losing++;
    else r.tied++;
  }
  return r;
}

export function totalOwned(p: Portfolio) {
  let n = 0;
  for (const b of p.leagues) n += b.myRoster?.players?.length ?? 0;
  return n;
}

export function recordStr(r: { wins: number; losses: number; ties: number }) {
  return r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

/** Bench = rostered, not starting, not IR, not taxi. */
export function rosterGroups(b: LeagueBundle) {
  const r = b.myRoster;
  if (!r) return { starters: [] as { slot: string; playerId: string | null }[], bench: [] as string[], ir: [] as string[], taxi: [] as string[] };
  const slots = startingSlots(b.league);
  const starters = slots.map((slot, i) => ({ slot, playerId: r.starters?.[i] && r.starters[i] !== "0" ? r.starters[i] : null }));
  const startingIds = new Set(r.starters ?? []);
  const ir = r.reserve ?? [];
  const taxi = r.taxi ?? [];
  const bench = (r.players ?? []).filter((id) => !startingIds.has(id) && !ir.includes(id) && !taxi.includes(id));
  return { starters, bench, ir, taxi };
}

export interface DynastySnapshot {
  leagueId: string;
  avgStarterAge: number | null;
  avgRosterAge: number | null;
  under25: number;
  over28: number;
  taxiCount: number;
  rosterSize: number;
}

export function dynastySnapshot(b: LeagueBundle, players: PlayerMap): DynastySnapshot {
  const ids = b.myRoster?.players ?? [];
  const ages = (list: string[]) => list.map((id) => players[id]?.age).filter((a): a is number => typeof a === "number");
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, c) => a + c, 0) / xs.length) * 10) / 10 : null);
  const starterIds = (b.myRoster?.starters ?? []).filter((id) => id && id !== "0");
  const allAges = ages(ids.filter((id) => players[id]?.pos !== "DEF" && players[id]?.pos !== "K"));
  return {
    leagueId: b.league.league_id,
    avgStarterAge: avg(ages(starterIds.filter((id) => players[id]?.pos !== "DEF" && players[id]?.pos !== "K"))),
    avgRosterAge: avg(allAges),
    under25: allAges.filter((a) => a < 25).length,
    over28: allAges.filter((a) => a >= 28).length,
    taxiCount: b.myRoster?.taxi?.length ?? 0,
    rosterSize: ids.length,
  };
}
