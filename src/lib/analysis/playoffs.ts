/**
 * Playoff Push math: clinch scenarios, remaining schedule difficulty, trade-deadline
 * framing, and who to root against. All pure functions over a LeagueBundle plus the
 * compact season schedule from /api/sleeper/playoffs.
 */
import type { LeagueBundle, TeamInfo } from "@/lib/portfolio/types";
import { myTeam, recordStr } from "@/lib/analysis/summary";

export interface ScheduleRow {
  r: number;
  o: number | null;
  p: number;
}
export type SeasonSchedule = Record<number, ScheduleRow[]>;

export interface RootTarget {
  team: TeamInfo;
  gamesAhead: number;
}

export interface KeyMatchup {
  a: TeamInfo;
  b: TeamInfo;
  involvesMe: boolean;
  note: string;
}

export interface PlayoffPicture {
  leagueId: string;
  leagueName: string;
  hasPlayoffs: boolean;
  myRosterId: number | null;
  seed: number | null;
  record: { wins: number; losses: number; ties: number };
  pointsFor: number;
  pointsAgainst: number;
  gamesPlayed: number;
  regSeasonEnd: number;
  remainingWeeks: number;
  playoffTeams: number;
  /** Team currently holding the final playoff spot. */
  finalSpot: TeamInfo | null;
  /** First team currently outside the playoffs. */
  firstOut: TeamInfo | null;
  /** Games back of the final playoff spot (negative = games clear of it). */
  gamesBackFinal: number | null;
  gamesBackFirst: number | null;
  /** (season games + 1) − your wins − (first-out losses). <= 0 means clinched. */
  magicNumber: number | null;
  clinched: boolean;
  eliminated: boolean;
  /** Average opponent win% for remaining weeks vs. weeks already played. */
  sosRemaining: number | null;
  sosFaced: number | null;
  /** Rough projected final record from per-game PF/PA differentials. */
  projWins: number | null;
  projLosses: number | null;
  tradeDeadlineWeek: number | null;
  deadlineWeeksLeft: number | null;
  contender: boolean | null;
  rootAgainst: RootTarget[];
  keyMatchups: KeyMatchup[];
}

type Rec = { wins: number; losses: number };

/** Standard games-back: how far `team` trails `leader`. */
export function gamesBack(leader: Rec, team: Rec) {
  return ((leader.wins - team.wins) + (team.losses - leader.losses)) / 2;
}

function winPct(t: TeamInfo) {
  const g = t.record.wins + t.record.losses + t.record.ties;
  return g > 0 ? (t.record.wins + t.record.ties / 2) / g : 0;
}

function oppInWeek(schedule: SeasonSchedule, week: number, rosterId: number): number | null {
  const row = (schedule[week] ?? []).find((x) => x.r === rosterId);
  return row?.o ?? null;
}

export function buildPlayoffPicture(
  b: LeagueBundle,
  schedule: SeasonSchedule | null,
  nflWeek: number,
): PlayoffPicture {
  const me = myTeam(b);
  const base = {
    leagueId: b.league.league_id,
    leagueName: b.league.name,
    myRosterId: b.myRosterId,
    seed: me?.standing ?? null,
    record: me?.record ?? { wins: 0, losses: 0, ties: 0 },
    pointsFor: me?.pointsFor ?? 0,
    pointsAgainst: me?.pointsAgainst ?? 0,
  };
  const playoffTeams = b.format.playoffTeams;
  if (!me || !playoffTeams || playoffTeams <= 0) {
    return {
      ...base,
      hasPlayoffs: false,
      gamesPlayed: 0,
      regSeasonEnd: 0,
      remainingWeeks: 0,
      playoffTeams: playoffTeams ?? 0,
      finalSpot: null,
      firstOut: null,
      gamesBackFinal: null,
      gamesBackFirst: null,
      magicNumber: null,
      clinched: false,
      eliminated: false,
      sosRemaining: null,
      sosFaced: null,
      projWins: null,
      projLosses: null,
      tradeDeadlineWeek: b.format.tradeDeadline,
      deadlineWeeksLeft: b.format.tradeDeadline != null ? b.format.tradeDeadline - nflWeek : null,
      contender: null,
      rootAgainst: [],
      keyMatchups: [],
    };
  }

  const teams = b.teams;
  const byRoster = new Map(teams.map((t) => [t.rosterId, t]));
  const played = me.record.wins + me.record.losses + me.record.ties;
  const regSeasonEnd = (b.format.playoffStart ?? 15) - 1;
  const remainingWeeks = Math.max(0, regSeasonEnd - played);
  const finalSpot = teams[playoffTeams - 1] ?? null;
  const firstOut = teams[playoffTeams] ?? null;
  const leader = teams[0] ?? null;

  const gamesBackFinal = finalSpot ? gamesBack(finalSpot.record, me.record) : null;
  const gamesBackFirst = leader ? gamesBack(leader.record, me.record) : null;
  const magicNumber =
    firstOut != null ? regSeasonEnd + 1 - me.record.wins - firstOut.record.losses : null;
  const clinched = magicNumber != null && magicNumber <= 0;
  const eliminated =
    !clinched && finalSpot != null && me.record.wins + remainingWeeks < finalSpot.record.wins;

  // Remaining vs. faced schedule difficulty (opponent win%).
  let sosRemaining: number | null = null;
  let sosFaced: number | null = null;
  if (schedule && b.myRosterId != null) {
    const rem: number[] = [];
    for (let w = Math.max(1, nflWeek); w <= regSeasonEnd; w++) {
      const t = byRoster.get(oppInWeek(schedule, w, b.myRosterId) ?? -1);
      if (t) rem.push(winPct(t));
    }
    const faced: number[] = [];
    for (let w = 1; w < nflWeek; w++) {
      const t = byRoster.get(oppInWeek(schedule, w, b.myRosterId) ?? -1);
      if (t) faced.push(winPct(t));
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
    sosRemaining = avg(rem);
    sosFaced = avg(faced);
  }

  // Rough projected final record: per-week win probability from PF/PA differentials.
  let projWins: number | null = null;
  let projLosses: number | null = null;
  if (schedule && b.myRosterId != null && played > 0) {
    const myPFg = me.pointsFor / played;
    const myPAg = me.pointsAgainst / played;
    let exp = me.record.wins;
    let n = 0;
    for (let w = Math.max(1, nflWeek); w <= regSeasonEnd; w++) {
      const opp = byRoster.get(oppInWeek(schedule, w, b.myRosterId) ?? -1);
      if (!opp) continue;
      const og = opp.record.wins + opp.record.losses + opp.record.ties;
      if (og <= 0) continue;
      const myExp = (myPFg + opp.pointsAgainst / og) / 2;
      const oppExp = (opp.pointsFor / og + myPAg) / 2;
      const diff = myExp - oppExp;
      exp += 1 / (1 + Math.pow(10, -diff / 20));
      n++;
    }
    if (n > 0) {
      projWins = Math.round(exp * 10) / 10;
      projLosses = Math.round((me.record.losses + (n - (exp - me.record.wins))) * 10) / 10;
    }
  }

  const tradeDeadlineWeek = b.format.tradeDeadline;
  const deadlineWeeksLeft = tradeDeadlineWeek != null ? tradeDeadlineWeek - nflWeek : null;
  const contender = me.standing <= playoffTeams;

  // Teams ahead of you within ~2 games: who you want to lose.
  const rootAgainst: RootTarget[] = teams
    .filter((t) => t.rosterId !== me.rosterId && t.standing < me.standing)
    .map((t) => ({ team: t, gamesAhead: gamesBack(t.record, me.record) }))
    .filter((x) => x.gamesAhead <= 2)
    .sort((a, b) => a.team.standing - b.team.standing);

  // This week's games that move your seeding: yours, plus bubble-vs-bubble games.
  const keyMatchups: KeyMatchup[] = [];
  if (schedule) {
    const rows = schedule[nflWeek] ?? [];
    const seen = new Set<string>();
    const inBubble = (t: TeamInfo) => t.standing >= playoffTeams - 2 && t.standing <= playoffTeams + 3;
    for (const row of rows) {
      if (row.o == null) continue;
      const key = [row.r, row.o].sort((x, y) => x - y).join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      const a = byRoster.get(row.r);
      const c = byRoster.get(row.o);
      if (!a || !c) continue;
      const involvesMe = row.r === me.rosterId || row.o === me.rosterId;
      if (!involvesMe && !(inBubble(a) && inBubble(c))) continue;
      const note = involvesMe
        ? `You (${recordStr(me.record)}) vs ${(row.r === me.rosterId ? c : a).teamName} (${recordStr((row.r === me.rosterId ? c : a).record)})`
        : `#${a.standing} ${a.teamName} (${recordStr(a.record)}) vs #${c.standing} ${c.teamName} (${recordStr(c.record)})`;
      keyMatchups.push({ a, b: c, involvesMe, note });
    }
    keyMatchups.sort((x, y) => (x.involvesMe ? -1 : 0) - (y.involvesMe ? -1 : 0));
  }

  return {
    ...base,
    hasPlayoffs: true,
    gamesPlayed: played,
    regSeasonEnd,
    remainingWeeks,
    playoffTeams,
    finalSpot,
    firstOut,
    gamesBackFinal,
    gamesBackFirst,
    magicNumber,
    clinched,
    eliminated,
    sosRemaining,
    sosFaced,
    projWins,
    projLosses,
    tradeDeadlineWeek,
    deadlineWeeksLeft,
    contender,
    rootAgainst,
    keyMatchups,
  };
}

/** One-line status like "2-1 · #3 of 12 · 1.0 GB of final spot · magic #5". */
export function pictureSummary(p: PlayoffPicture) {
  const rec = recordStr(p.record);
  if (!p.hasPlayoffs) return rec;
  if (p.clinched) return `${rec} · clinched`;
  if (p.eliminated) return `${rec} · eliminated (rough)`;
  const gb =
    p.gamesBackFinal == null
      ? ""
      : p.gamesBackFinal > 0
        ? ` · ${trimNum(p.gamesBackFinal)} GB of final spot`
        : p.gamesBackFinal < 0
          ? ` · ${trimNum(-p.gamesBackFinal)} clear of final spot`
          : " · tied for final spot";
  const magic = p.magicNumber != null && p.magicNumber > 0 ? ` · magic #${p.magicNumber}` : "";
  return `${rec} · #${p.seed}${gb}${magic}`;
}

function trimNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** "2.5 back" / "1 clear" / "tied" / "—" for a games-back value. */
export function formatGb(gb: number | null) {
  if (gb == null) return "—";
  if (gb === 0) return "tied";
  return gb > 0 ? `${trimNum(gb)} back` : `${trimNum(-gb)} clear`;
}
