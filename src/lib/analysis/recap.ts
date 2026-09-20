/**
 * League history + recaps, built from Sleeper's own records. A dynasty league chains backward via
 * `previous_league_id`, so we can walk every past season. Everything here is factual — standings,
 * champions, scores, records — computed from the API, then phrased into readable narrative. No made-up
 * details: if a fact isn't in the data (e.g. an old bracket is missing), the writeup omits it.
 */
import type { SleeperLeague, SleeperRoster, SleeperLeagueUser, SleeperMatchup } from "@/lib/sleeper/types";

export interface SeasonTeam {
  rosterId: number;
  name: string;
  owner: string;
  wins: number; losses: number; ties: number;
  pointsFor: number; pointsAgainst: number;
  standing: number;
  isChampion: boolean;
  isRunnerUp: boolean;
}

export interface SeasonRecap {
  season: string;
  leagueId: string;
  leagueName: string;
  teams: SeasonTeam[];
  champion: SeasonTeam | null;
  runnerUp: SeasonTeam | null;
  highestScorer: SeasonTeam | null;   // most points for
  bestRecord: SeasonTeam | null;
  complete: boolean;
  narrative: string[];
}

function teamName(r: SleeperRoster, users: Map<string, SleeperLeagueUser>) {
  const u = r.owner_id ? users.get(r.owner_id) : undefined;
  return { name: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`, owner: u?.display_name || "Unknown" };
}

/** Build a season's standings from rosters. */
export function seasonTeams(rosters: SleeperRoster[], users: SleeperLeagueUser[]): SeasonTeam[] {
  const umap = new Map(users.map((u) => [u.user_id, u]));
  const teams = rosters.map((r) => {
    const s = r.settings ?? { wins: 0, losses: 0, ties: 0 };
    const nm = teamName(r, umap);
    return {
      rosterId: r.roster_id, name: nm.name, owner: nm.owner,
      wins: s.wins ?? 0, losses: s.losses ?? 0, ties: s.ties ?? 0,
      pointsFor: (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100,
      pointsAgainst: (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100,
      standing: 0, isChampion: false, isRunnerUp: false,
    };
  });
  teams.sort((a, b) => (b.wins + b.ties / 2) - (a.wins + a.ties / 2) || b.pointsFor - a.pointsFor);
  teams.forEach((t, i) => (t.standing = i + 1));
  return teams;
}

/** Champion + runner-up from the winners bracket's final (p:1) match, if present. */
export function applyChampion(teams: SeasonTeam[], bracket: { p?: number; w: number | null; l: number | null }[] | null) {
  const final = bracket?.find((m) => m.p === 1);
  if (!final || final.w == null) return;
  const champ = teams.find((t) => t.rosterId === final.w);
  const ru = teams.find((t) => t.rosterId === final.l);
  if (champ) champ.isChampion = true;
  if (ru) ru.isRunnerUp = true;
}

export function buildSeasonRecap(league: SleeperLeague, rosters: SleeperRoster[], users: SleeperLeagueUser[], bracket: { p?: number; w: number | null; l: number | null }[] | null): SeasonRecap {
  const teams = seasonTeams(rosters, users);
  applyChampion(teams, bracket);
  const champion = teams.find((t) => t.isChampion) ?? null;
  const runnerUp = teams.find((t) => t.isRunnerUp) ?? null;
  const highestScorer = [...teams].sort((a, b) => b.pointsFor - a.pointsFor)[0] ?? null;
  const bestRecord = teams[0] ?? null;
  const complete = league.status === "complete" || !!champion;

  const n: string[] = [];
  const yr = league.season;
  if (champion) {
    n.push(`${champion.name} (${champion.owner}) won the ${yr} title${runnerUp ? `, beating ${runnerUp.name} in the final` : ""}.`);
    if (champion.standing > 2) n.push(`They backed in as the ${ord(champion.standing)} seed at ${rec(champion)} and got hot when it mattered.`);
    else if (champion.standing === 1) n.push(`They were the class of the league wire to wire — best record at ${rec(champion)} and the ring to match.`);
  } else if (complete) {
    n.push(`${bestRecord?.name} finished ${yr} atop the standings at ${bestRecord ? rec(bestRecord) : ""}${bestRecord && highestScorer && bestRecord.rosterId !== highestScorer.rosterId ? "" : ""}.`);
  } else {
    n.push(`${yr} is still in progress. ${bestRecord?.name} leads at ${bestRecord ? rec(bestRecord) : ""}.`);
  }
  if (highestScorer && highestScorer.rosterId !== (champion?.rosterId ?? -1)) {
    n.push(`${highestScorer.name} scored the most points (${highestScorer.pointsFor.toFixed(0)})${champion ? " but didn't take the title — the annual reminder that points don't equal trophies" : ""}.`);
  }
  const unlucky = [...teams].sort((a, b) => (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)).reverse()[0];
  if (unlucky && teams.length > 4 && unlucky.pointsFor > unlucky.pointsAgainst && unlucky.standing > teams.length / 2) {
    n.push(`${unlucky.name} outscored their opponents on the season yet finished ${ord(unlucky.standing)} — a brutal schedule.`);
  }
  return { season: yr, leagueId: league.league_id, leagueName: league.name, teams, champion, runnerUp, highestScorer, bestRecord, complete, narrative: n };
}

const ord = (n: number) => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n] || "th");
const rec = (t: SeasonTeam) => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;

/* ---------------- Weekly recap (current season) ---------------- */

export interface WeekResult {
  matchupId: number | null;
  a: { rosterId: number; name: string; points: number };
  b: { rosterId: number; name: string; points: number } | null;
  margin: number;
}
export interface WeekRecap {
  week: number;
  results: WeekResult[];
  highTeam: { name: string; points: number } | null;
  lowTeam: { name: string; points: number } | null;
  blowout: WeekResult | null;
  nailbiter: WeekResult | null;
  narrative: string[];
}

export function buildWeekRecap(week: number, matchups: SleeperMatchup[], rosters: SleeperRoster[], users: SleeperLeagueUser[]): WeekRecap {
  const umap = new Map(users.map((u) => [u.user_id, u]));
  const nameOf = (rid: number) => { const r = rosters.find((x) => x.roster_id === rid); return r ? teamName(r, umap).name : `Team ${rid}`; };
  const byMatch = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) { if (m.matchup_id == null) continue; byMatch.set(m.matchup_id, [...(byMatch.get(m.matchup_id) ?? []), m]); }
  const results: WeekResult[] = [];
  for (const [mid, pair] of byMatch) {
    const [x, y] = pair.sort((p, q) => (q.points ?? 0) - (p.points ?? 0));
    results.push({
      matchupId: mid,
      a: { rosterId: x.roster_id, name: nameOf(x.roster_id), points: x.points ?? 0 },
      b: y ? { rosterId: y.roster_id, name: nameOf(y.roster_id), points: y.points ?? 0 } : null,
      margin: y ? Math.abs((x.points ?? 0) - (y.points ?? 0)) : 0,
    });
  }
  const allTeams = matchups.map((m) => ({ name: nameOf(m.roster_id), points: m.points ?? 0 })).sort((a, b) => b.points - a.points);
  const high = allTeams[0] ?? null, low = allTeams[allTeams.length - 1] ?? null;
  const decided = results.filter((r) => r.b);
  const blowout = [...decided].sort((a, b) => b.margin - a.margin)[0] ?? null;
  const nailbiter = [...decided].sort((a, b) => a.margin - b.margin)[0] ?? null;

  const n: string[] = [];
  if (high) n.push(`${high.name} dropped a league-high ${high.points.toFixed(1)} this week.`);
  if (blowout && blowout.b) n.push(`${blowout.a.name} steamrolled ${blowout.b.name} by ${blowout.margin.toFixed(1)} — the week's biggest beatdown.`);
  if (nailbiter && nailbiter.b && nailbiter.margin < 6) n.push(`${nailbiter.a.name} squeaked past ${nailbiter.b.name} by just ${nailbiter.margin.toFixed(1)}.`);
  if (low) n.push(`${low.name} will want to forget this one — a league-low ${low.points.toFixed(1)}.`);
  return { week, results, highTeam: high, lowTeam: low, blowout, nailbiter, narrative: n };
}
