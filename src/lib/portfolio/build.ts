import { sleeper, pickPlayers, fantasyPosition } from "@/lib/sleeper/client";
import { deriveFormat } from "@/lib/league/format";
import { providerStatus } from "@/lib/providers";
import type { SleeperLeague, SleeperLeagueUser, SleeperMatchup, SleeperRoster } from "@/lib/sleeper/types";
import type { LeagueBundle, MyMatchup, Portfolio, TeamInfo } from "./types";

function pts(whole?: number, dec?: number) {
  return (whole ?? 0) + (dec ?? 0) / 100;
}

export function buildTeams(rosters: SleeperRoster[], users: SleeperLeagueUser[]): TeamInfo[] {
  const byUser = new Map(users.map((u) => [u.user_id, u]));
  const teams: TeamInfo[] = rosters.map((r) => {
    const u = r.owner_id ? byUser.get(r.owner_id) : undefined;
    const s = r.settings ?? { wins: 0, losses: 0, ties: 0 };
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      ownerName: u?.display_name ?? "Open team",
      teamName: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
      avatar: u?.metadata?.avatar ?? (u?.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null),
      record: { wins: s.wins ?? 0, losses: s.losses ?? 0, ties: s.ties ?? 0 },
      pointsFor: pts(s.fpts, s.fpts_decimal),
      pointsAgainst: pts(s.fpts_against, s.fpts_against_decimal),
      waiverPosition: s.waiver_position ?? null,
      faabUsed: s.waiver_budget_used ?? null,
      standing: 0,
    };
  });
  teams.sort((a, b) => {
    const wa = a.record.wins + a.record.ties / 2;
    const wb = b.record.wins + b.record.ties / 2;
    if (wb !== wa) return wb - wa;
    return b.pointsFor - a.pointsFor;
  });
  teams.forEach((t, i) => (t.standing = i + 1));
  return teams;
}

export function buildMyMatchup(matchups: SleeperMatchup[] | null, myRosterId: number | null): MyMatchup | null {
  if (!matchups || myRosterId == null) return null;
  const mine = matchups.find((m) => m.roster_id === myRosterId);
  if (!mine) return null;
  const opp = mine.matchup_id != null
    ? matchups.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== myRosterId)
    : undefined;
  return {
    matchupId: mine.matchup_id,
    myPoints: mine.points ?? 0,
    oppRosterId: opp?.roster_id ?? null,
    oppPoints: opp ? opp.points ?? 0 : null,
    myStarters: mine.starters ?? [],
    oppStarters: opp?.starters ?? [],
    myStarterPoints: mine.starters_points ?? [],
    oppStarterPoints: opp?.starters_points ?? [],
  };
}

export async function buildLeagueBundle(league: SleeperLeague, userId: string, week: number): Promise<LeagueBundle> {
  const [rosters, users, matchups] = await Promise.all([
    sleeper.rosters(league.league_id),
    sleeper.users(league.league_id),
    week > 0 ? sleeper.matchups(league.league_id, week) : Promise.resolve(null),
  ]);
  const r = rosters ?? [];
  const mine = r.find((x) => x.owner_id === userId || x.co_owners?.includes(userId)) ?? null;
  const ownership: Record<string, number> = {};
  for (const ro of r) for (const pid of ro.players ?? []) ownership[pid] = ro.roster_id;

  return {
    league,
    format: deriveFormat(league),
    teams: buildTeams(r, users ?? []),
    myRosterId: mine?.roster_id ?? null,
    myRoster: mine,
    rosters: r,
    matchup: buildMyMatchup(matchups, mine?.roster_id ?? null),
    ownership,
    week,
  };
}

/** Choose the week to analyze: the live week during the season, week 1 before it starts. */
export function currentWeek(state: { week: number; display_week: number; season_type: string }) {
  if (state.season_type === "pre") return 1;
  return Math.max(1, state.display_week || state.week || 1);
}

export async function buildPortfolio(username: string): Promise<Portfolio> {
  const warnings: string[] = [];
  const [user, state] = await Promise.all([sleeper.user(username), sleeper.state()]);
  if (!user) throw new Error(`Sleeper has no user named "${username}".`);

  const season = state.league_season ?? state.season;
  const week = currentWeek(state);
  let leagues = (await sleeper.leagues(user.user_id, season)) ?? [];
  if (leagues.length === 0 && state.previous_season) {
    leagues = (await sleeper.leagues(user.user_id, state.previous_season)) ?? [];
    if (leagues.length) warnings.push(`No ${season} leagues found yet — showing ${state.previous_season}.`);
  }

  // Only redraft/dynasty; keeper is shown but flagged. Skip best-ball entirely.
  leagues = leagues.filter((l) => !l.settings?.best_ball);

  const bundles = await Promise.all(
    leagues.map(async (l) => {
      try {
        return await buildLeagueBundle(l, user.user_id, week);
      } catch (e) {
        warnings.push(`Could not load ${l.name}: ${(e as Error).message}`);
        return null;
      }
    }),
  );

  const ok = bundles.filter((b): b is LeagueBundle => b !== null);
  ok.sort((a, b) => a.league.name.localeCompare(b.league.name));

  // Any rostered id that the trimmed player set would drop (retired/inactive with no team)
  // still needs a name. The raw dump is cached for 24h so this is a memory lookup.
  let extraPlayers = {};
  try {
    const raw = await sleeper.playersRaw();
    const ids = new Set<string>();
    // Anything the trimmed set would skip: inactive with no team, or a non-fantasy primary position.
    for (const b of ok) for (const r of b.rosters) for (const id of r.players ?? []) {
      const p = raw[id];
      if (!p) continue;
      const pos = fantasyPosition(p);
      if ((!p.active && !p.team) || !pos || !["QB", "RB", "WR", "TE", "K", "DEF"].includes(pos)) ids.add(id);
    }
    extraPlayers = pickPlayers(raw, ids);
  } catch {
    warnings.push("Could not resolve inactive rostered players.");
  }

  return {
    user,
    state,
    season,
    week,
    leagues: ok,
    providers: providerStatus(),
    extraPlayers,
    fetchedAt: new Date().toISOString(),
    warnings,
  };
}
