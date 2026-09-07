/**
 * SleeperProvider — server-side, read-only client for Sleeper's documented API.
 * Uses Next.js fetch caching so we never hammer Sleeper on every render.
 */
import type {
  SleeperUser, SleeperNflState, SleeperLeague, SleeperRoster, SleeperLeagueUser,
  SleeperMatchup, SleeperTradedPick, SleeperTransaction, SleeperTrendingPlayer,
  SleeperPlayerRaw, Player, PlayerMap, SleeperProjectionRaw, ProjectionMap,
} from "./types";

const BASE = process.env.SLEEPER_API_BASE ?? "https://api.sleeper.app/v1";
/** Projections live outside /v1 on the same host. */
const ROOT = BASE.replace(/\/v1\/?$/, "");

/** Cache lifetimes (seconds). Player metadata is static-ish; matchups move fast. */
export const TTL = {
  state: 60 * 5,
  user: 60 * 60,
  leagues: 60 * 10,
  rosters: 60 * 3,
  users: 60 * 30,
  matchups: 60 * 2,
  transactions: 60 * 5,
  tradedPicks: 60 * 60,
  trending: 60 * 15,
  players: 60 * 60 * 24,
  projections: 60 * 30,
} as const;

export class SleeperError extends Error {
  constructor(public status: number, public path: string, msg?: string) {
    super(msg ?? `Sleeper responded ${status} for ${path}`);
  }
}

async function get<T>(path: string, revalidate: number, base = BASE): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { accept: "application/json" },
    next: { revalidate },
  });
  if (res.status === 404) return null as T;
  if (!res.ok) throw new SleeperError(res.status, path);
  return (await res.json()) as T;
}

export const sleeper = {
  user: (username: string) =>
    get<SleeperUser | null>(`/user/${encodeURIComponent(username)}`, TTL.user),
  state: () => get<SleeperNflState>("/state/nfl", TTL.state),
  leagues: (userId: string, season: string) =>
    get<SleeperLeague[] | null>(`/user/${userId}/leagues/nfl/${season}`, TTL.leagues),
  league: (leagueId: string) => get<SleeperLeague | null>(`/league/${leagueId}`, TTL.leagues),
  rosters: (leagueId: string) =>
    get<SleeperRoster[] | null>(`/league/${leagueId}/rosters`, TTL.rosters),
  users: (leagueId: string) =>
    get<SleeperLeagueUser[] | null>(`/league/${leagueId}/users`, TTL.users),
  matchups: (leagueId: string, week: number) =>
    get<SleeperMatchup[] | null>(`/league/${leagueId}/matchups/${week}`, TTL.matchups),
  transactions: (leagueId: string, week: number) =>
    get<SleeperTransaction[] | null>(`/league/${leagueId}/transactions/${week}`, TTL.transactions),
  tradedPicks: (leagueId: string) =>
    get<SleeperTradedPick[] | null>(`/league/${leagueId}/traded_picks`, TTL.tradedPicks),
  trendingAdds: (hours = 24, limit = 50) =>
    get<SleeperTrendingPlayer[]>(`/players/nfl/trending/add?lookback_hours=${hours}&limit=${limit}`, TTL.trending),
  trendingDrops: (hours = 24, limit = 50) =>
    get<SleeperTrendingPlayer[]>(`/players/nfl/trending/drop?lookback_hours=${hours}&limit=${limit}`, TTL.trending),
  playersRaw: () => get<Record<string, SleeperPlayerRaw>>("/players/nfl", TTL.players),
  /** Weekly stat projections for every fantasy position (Sleeper's in-app numbers, via Rotowire). */
  projectionsRaw: (season: string, week: number) =>
    get<SleeperProjectionRaw[] | null>(
      `/projections/nfl/${season}/${week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF`,
      TTL.projections,
      ROOT,
    ),
};

/** Keep only players with a real projection and only numeric stat keys (drops ADP fields). */
export function trimProjections(rows: SleeperProjectionRaw[] | null): ProjectionMap {
  const out: ProjectionMap = {};
  for (const r of rows ?? []) {
    const st = r.stats ?? {};
    if (!(st.pts_ppr || st.pts_half_ppr || st.pts_std || st.gp)) continue;
    const stats: Record<string, number> = {};
    for (const [k, v] of Object.entries(st)) if (typeof v === "number" && !k.startsWith("adp_")) stats[k] = v;
    out[r.player_id] = { team: r.team ?? null, opp: r.opponent ?? null, gameId: r.game_id ?? null, date: r.date ?? null, stats };
  }
  return out;
}

const FANTASY_POS = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);

/**
 * Fantasy position for a player. Sleeper's `position` is the NFL depth-chart position, which
 * can be non-fantasy (Travis Hunter = DB with fantasy_positions [DB, WR]; fullbacks = FB with [RB]).
 * Prefer a fantasy-relevant entry from fantasy_positions, then fall back to `position`.
 */
export function fantasyPosition(p: SleeperPlayerRaw): string | null {
  if (p.position && FANTASY_POS.has(p.position)) return p.position;
  const fp = p.fantasy_positions?.find((x) => FANTASY_POS.has(x));
  return fp ?? p.position ?? p.fantasy_positions?.[0] ?? null;
}

export function trimPlayer(id: string, p: SleeperPlayerRaw): Player | null {
  const pos = fantasyPosition(p);
  if (!pos) return null;
  const first = p.first_name ?? "";
  const last = p.last_name ?? "";
  return {
    id,
    name: pos === "DEF" ? `${first} ${last}`.trim() || id : (p.full_name ?? `${first} ${last}`.trim()),
    first,
    last,
    pos,
    team: p.team ?? null,
    status: p.status ?? null,
    injury: p.injury_status ?? null,
    injuryPart: p.injury_body_part ?? null,
    age: p.age ?? null,
    exp: p.years_exp ?? null,
    number: p.number ?? null,
    depth: p.depth_chart_order ?? null,
    active: !!p.active,
    rank: p.search_rank ?? null,
  };
}

/** Records for specific ids (e.g. rostered players that fell outside the trimmed set). */
export function pickPlayers(raw: Record<string, SleeperPlayerRaw>, ids: Iterable<string>): PlayerMap {
  const out: PlayerMap = {};
  for (const id of ids) {
    const p = raw[id];
    if (!p) continue;
    const t = trimPlayer(id, p);
    if (t) out[id] = t;
  }
  return out;
}

/** Trim the ~5MB Sleeper player dump to the fields we actually use. */
export function trimPlayers(raw: Record<string, SleeperPlayerRaw>): PlayerMap {
  const out: PlayerMap = {};
  for (const [id, p] of Object.entries(raw)) {
    const pos = fantasyPosition(p);
    if (!pos || !FANTASY_POS.has(pos)) continue;
    // Keep active players and anyone attached to an NFL team (IR guys are often rostered).
    if (!p.active && !p.team) continue;
    const first = p.first_name ?? "";
    const last = p.last_name ?? "";
    out[id] = {
      id,
      name: pos === "DEF" ? `${first} ${last}`.trim() || id : (p.full_name ?? `${first} ${last}`.trim()),
      first,
      last,
      pos,
      team: p.team ?? null,
      status: p.status ?? null,
      injury: p.injury_status ?? null,
      injuryPart: p.injury_body_part ?? null,
      age: p.age ?? null,
      exp: p.years_exp ?? null,
      number: p.number ?? null,
      depth: p.depth_chart_order ?? null,
      active: !!p.active,
      rank: p.search_rank ?? null,
    };
  }
  return out;
}

/** Sleeper's public CDN for avatars, team logos and headshots. */
export const cdn = {
  avatar: (id: string | null | undefined, thumb = true) =>
    id ? `https://sleepercdn.com/avatars/${thumb ? "thumbs/" : ""}${id}` : null,
  teamLogo: (team: string | null | undefined) =>
    team ? `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png` : null,
  headshot: (playerId: string, pos: string, team: string | null) =>
    pos === "DEF" ? cdn.teamLogo(team) : `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
};
