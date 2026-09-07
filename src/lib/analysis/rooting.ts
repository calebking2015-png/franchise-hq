/**
 * Rooting interests: every NFL player who is starting for you or against you this week,
 * across every league, weighted by how many points he's projected to score in each league.
 * Pure function over the Portfolio + projections; no external data.
 */
import type { LeagueBundle, Portfolio } from "@/lib/portfolio/types";
import type { PlayerMap, ProjectionMap } from "@/lib/sleeper/types";
import { projectPlayer } from "@/lib/projections";

export type Side = "for" | "against" | "neutral";

/**
 * Standings rivals: teams within one game of you (excluding this week's opponent, who is already
 * counted). Their starters are people you quietly want to fail. Meaningful from ~week 4 on.
 */
export interface RivalInterest {
  playerId: string;
  stake: number; // projected points, summed across rival teams starting him (positive = bad for you)
  rivals: { leagueId: string; leagueName: string; team: string; record: string; proj: number | null }[];
}

export const RIVALS_MIN_WEEK = 4;

export function rivalInterests(p: Portfolio, players: PlayerMap, proj: ProjectionMap): RivalInterest[] {
  const map = new Map<string, RivalInterest>();
  for (const b of p.leagues) {
    const me = b.teams.find((t) => t.rosterId === b.myRosterId);
    if (!me) continue;
    const myW = me.record.wins + me.record.ties / 2;
    const oppId = b.matchup?.oppRosterId ?? null;
    for (const t of b.teams) {
      if (t.rosterId === me.rosterId || t.rosterId === oppId) continue;
      const w = t.record.wins + t.record.ties / 2;
      if (Math.abs(w - myW) > 1) continue;
      const roster = b.rosters.find((r) => r.roster_id === t.rosterId);
      for (const pid of roster?.starters ?? []) {
        if (!pid || pid === "0" || !players[pid]) continue;
        const pr = projectPlayer(pid, b, players, proj);
        const r = map.get(pid) ?? { playerId: pid, stake: 0, rivals: [] };
        r.rivals.push({ leagueId: b.league.league_id, leagueName: b.league.name, team: t.teamName, record: `${t.record.wins}-${t.record.losses}${t.record.ties ? `-${t.record.ties}` : ""}`, proj: pr });
        r.stake += pr ?? 0;
        map.set(pid, r);
      }
    }
  }
  return [...map.values()].map((r) => ({ ...r, stake: Math.round(r.stake * 10) / 10 })).sort((a, c) => c.stake - a.stake);
}

export interface RootingLeague {
  leagueId: string;
  leagueName: string;
  side: "for" | "against";
  proj: number | null;
  /** Fantasy team that starts him (yours, or the opponent's). */
  team: string;
}

export interface RootingInterest {
  playerId: string;
  forCount: number;
  againstCount: number;
  /** Sum of projected points where he helps you minus where he hurts you. */
  stake: number;
  /** Projected points summed over every league where he's starting on either side. */
  exposure: number;
  side: Side;
  leagues: RootingLeague[];
  opp: string | null;
  gameId: string | null;
}

export interface TeamRooting {
  team: string;
  opp: string | null;
  stake: number;
  forCount: number;
  againstCount: number;
  players: RootingInterest[];
}

function oppTeamName(b: LeagueBundle) {
  const rid = b.matchup?.oppRosterId;
  return b.teams.find((t) => t.rosterId === rid)?.teamName ?? "Opponent";
}
function myTeamName(b: LeagueBundle) {
  return b.teams.find((t) => t.rosterId === b.myRosterId)?.teamName ?? "Me";
}

export function rootingInterests(p: Portfolio, players: PlayerMap, proj: ProjectionMap): RootingInterest[] {
  const map = new Map<string, RootingInterest>();
  const get = (pid: string) => {
    let r = map.get(pid);
    if (!r) {
      r = { playerId: pid, forCount: 0, againstCount: 0, stake: 0, exposure: 0, side: "neutral", leagues: [], opp: proj[pid]?.opp ?? null, gameId: proj[pid]?.gameId ?? null };
      map.set(pid, r);
    }
    return r;
  };
  for (const b of p.leagues) {
    const m = b.matchup;
    if (!m) continue;
    const add = (ids: string[], side: "for" | "against", team: string) => {
      for (const pid of ids) {
        if (!pid || pid === "0" || !players[pid]) continue;
        const pr = projectPlayer(pid, b, players, proj);
        const r = get(pid);
        r.leagues.push({ leagueId: b.league.league_id, leagueName: b.league.name, side, proj: pr, team });
        if (side === "for") r.forCount++; else r.againstCount++;
        const w = pr ?? 0;
        r.stake += side === "for" ? w : -w;
        r.exposure += w;
      }
    };
    add(m.myStarters, "for", myTeamName(b));
    if (m.oppRosterId != null) add(m.oppStarters, "against", oppTeamName(b));
  }
  const out = [...map.values()];
  for (const r of out) {
    r.stake = Math.round(r.stake * 10) / 10;
    r.exposure = Math.round(r.exposure * 10) / 10;
    // Neutral = he's starting on both sides of your week and the projected stakes roughly cancel.
    if (r.forCount && r.againstCount && Math.abs(r.stake) < Math.max(3, r.exposure * 0.2)) r.side = "neutral";
    else r.side = r.stake > 0 || (r.stake === 0 && r.forCount > 0) ? "for" : "against";
  }
  return out.sort((a, b) => Math.abs(b.stake) - Math.abs(a.stake) || b.exposure - a.exposure);
}

/** Roll player stakes up to NFL teams: which real games do you actually care about. */
export function teamRooting(interests: RootingInterest[], players: PlayerMap): TeamRooting[] {
  const map = new Map<string, TeamRooting>();
  for (const r of interests) {
    const team = players[r.playerId]?.team;
    if (!team) continue;
    const t = map.get(team) ?? { team, opp: r.opp, stake: 0, forCount: 0, againstCount: 0, players: [] };
    t.stake += r.stake; t.forCount += r.forCount; t.againstCount += r.againstCount; t.players.push(r);
    if (!t.opp && r.opp) t.opp = r.opp;
    map.set(team, t);
  }
  return [...map.values()].map((t) => ({ ...t, stake: Math.round(t.stake * 10) / 10 })).sort((a, b) => Math.abs(b.stake) - Math.abs(a.stake));
}
