import type { LeagueBundle, Portfolio } from "@/lib/portfolio/types";
import type { PlayerMap, SleeperTrendingPlayer } from "@/lib/sleeper/types";
import { isHardOut } from "./alerts";

export type OwnershipState = "mine" | "available" | "other" | "opponent";

export interface LeagueOwnership {
  leagueId: string;
  leagueName: string;
  state: OwnershipState;
  ownerTeam?: string;
  isDynasty: boolean;
  starting?: boolean;
}

export interface PlayerExposure {
  playerId: string;
  shares: number;
  total: number;
  pct: number;
  leagues: LeagueOwnership[];
  startingShares: number;
}

/** Where does this player sit in every league? */
export function playerOwnership(pid: string, p: Portfolio): LeagueOwnership[] {
  return p.leagues.map((b) => {
    const rid = b.ownership[pid];
    const base = { leagueId: b.league.league_id, leagueName: b.league.name, isDynasty: b.format.isDynasty };
    if (!rid) return { ...base, state: "available" as const };
    if (rid === b.myRosterId) return { ...base, state: "mine" as const, starting: b.myRoster?.starters?.includes(pid) };
    const team = b.teams.find((t) => t.rosterId === rid);
    const state: OwnershipState = b.matchup?.oppRosterId === rid ? "opponent" : "other";
    return { ...base, state, ownerTeam: team?.teamName };
  });
}

export function exposureFor(pid: string, p: Portfolio): PlayerExposure {
  const leagues = playerOwnership(pid, p);
  const shares = leagues.filter((l) => l.state === "mine").length;
  return {
    playerId: pid,
    shares,
    total: p.leagues.length,
    pct: p.leagues.length ? Math.round((shares / p.leagues.length) * 100) : 0,
    leagues,
    startingShares: leagues.filter((l) => l.state === "mine" && l.starting).length,
  };
}

/** Every player I own anywhere, with exposure, sorted by shares then name. */
export function allExposure(p: Portfolio, players: PlayerMap): PlayerExposure[] {
  const ids = new Set<string>();
  for (const b of p.leagues) for (const id of b.myRoster?.players ?? []) ids.add(id);
  return [...ids]
    .map((id) => exposureFor(id, p))
    .sort((a, b) => b.shares - a.shares || (players[a.playerId]?.name ?? "").localeCompare(players[b.playerId]?.name ?? ""));
}

export interface TeamExposure { team: string; shares: number; players: { playerId: string; shares: number }[] }

export function teamExposure(exposure: PlayerExposure[], players: PlayerMap): TeamExposure[] {
  const map = new Map<string, TeamExposure>();
  for (const e of exposure) {
    const team = players[e.playerId]?.team;
    if (!team) continue;
    const t = map.get(team) ?? { team, shares: 0, players: [] };
    t.shares += e.shares;
    t.players.push({ playerId: e.playerId, shares: e.shares });
    map.set(team, t);
  }
  return [...map.values()].sort((a, b) => b.shares - a.shares);
}

export function positionExposure(exposure: PlayerExposure[], players: PlayerMap) {
  const out: Record<string, { shares: number; unique: number }> = {};
  for (const e of exposure) {
    const pos = players[e.playerId]?.pos ?? "?";
    out[pos] ??= { shares: 0, unique: 0 };
    out[pos].shares += e.shares;
    out[pos].unique += 1;
  }
  return out;
}

export function injuredExposure(exposure: PlayerExposure[], players: PlayerMap) {
  return exposure.filter((e) => {
    const p = players[e.playerId];
    return p && (p.injury || isHardOut(p));
  });
}

/** Concentration warnings, calculated from your own rosters. */
export function exposureWarnings(exposure: PlayerExposure[], teams: TeamExposure[], players: PlayerMap, leagueCount: number) {
  const warnings: { title: string; detail: string; playerId?: string; team?: string }[] = [];
  if (leagueCount < 2) return warnings;
  for (const e of exposure) {
    if (e.shares >= 3 && e.pct >= 50) {
      const p = players[e.playerId];
      warnings.push({ title: `High exposure: ${p?.name ?? e.playerId}`, detail: `Owned in ${e.shares}/${e.total} leagues (${e.pct}%). One bad Sunday hits most of your portfolio.`, playerId: e.playerId });
    }
  }
  for (const t of teams.slice(0, 3)) {
    if (t.shares >= leagueCount * 1.5) warnings.push({ title: `Heavy ${t.team} concentration`, detail: `${t.shares} roster shares across ${t.players.length} ${t.team} players.`, team: t.team });
  }
  return warnings;
}

/** Waiver radar: trending adds crossed with availability in your leagues. */
export interface WaiverCandidate {
  playerId: string;
  adds: number;
  drops: number;
  availableIn: LeagueOwnership[];
  ownedByMe: LeagueOwnership[];
  ownership: LeagueOwnership[];
}

export function waiverRadar(p: Portfolio, players: PlayerMap, adds: SleeperTrendingPlayer[], drops: SleeperTrendingPlayer[]): WaiverCandidate[] {
  const dropMap = new Map(drops.map((d) => [d.player_id, d.count]));
  return adds
    .filter((t) => players[t.player_id])
    .map((t) => {
      const ownership = playerOwnership(t.player_id, p);
      return {
        playerId: t.player_id,
        adds: t.count,
        drops: dropMap.get(t.player_id) ?? 0,
        availableIn: ownership.filter((o) => o.state === "available"),
        ownedByMe: ownership.filter((o) => o.state === "mine"),
        ownership,
      };
    })
    .sort((a, b) => b.adds - a.adds);
}

/** Depth at a position on my roster in a league, for "would this actually help?" context. */
export function positionalDepth(b: LeagueBundle, players: PlayerMap, pos: string) {
  const ids = (b.myRoster?.players ?? []).filter((id) => players[id]?.pos === pos);
  const healthy = ids.filter((id) => !isHardOut(players[id]));
  const starterSlots = b.format.starters.filter((s) => s.slot === pos).reduce((n, s) => n + s.count, 0);
  const flexSlots = b.format.starters.filter((s) => (b.format.eligibility[s.slot] ?? []).includes(pos) && s.slot !== pos).reduce((n, s) => n + s.count, 0);
  return { total: ids.length, healthy: healthy.length, starterSlots, flexSlots, ids };
}
