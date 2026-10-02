/**
 * Monte Carlo season simulator: playoff %, first-round bye %, and championship %
 * per team, plus a sim-derived expected final record.
 *
 * Model (kept deliberately simple and explainable — assumptions are surfaced in
 * the UI footnote, not buried here):
 * - Team strength comes from season scoring averages. Expected score for A vs B is
 *   avgPF(A) + (leagueAvgPF - avgPA(B)): how much you score, adjusted for how much
 *   the opponent usually gives up relative to league average.
 * - The score margin for a game is drawn from a Normal(diff, MARGIN_SD) with
 *   MARGIN_SD = 22, a typical half-PPR weekly margin spread. Win probability for a
 *   single game is therefore Phi(diff / 22). Tunable via options.marginSd.
 * - Weeks before the current NFL week count as already played (actual records stand).
 *   The current week onward is simulated in full — games already played this week
 *   are NOT locked in, which is the main approximation mid-weekend.
 * - Standings tiebreak: wins (ties = half win), then points-for. This matches the
 *   Playoffs tab's clinch math; real leagues may break ties differently.
 * - Playoff bracket: single elimination over the top `playoffTeams` seeds. Each round
 *   pairs the highest remaining seed vs the lowest remaining seed. Byes go to the
 *   top seeds so the bracket fills to a power of two
 *   (byes = nextPow2(playoffTeams) - playoffTeams).
 * - Points-for tiebreak uses expected remaining scores (deterministic), not drawn
 *   scores — the sim only needs PF to break standings ties, where the expectation
 *   is the honest central estimate.
 * - Default 10,000 iterations. Fast enough to run client-side per league.
 */

export interface SimTeamSeed {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface SimWeekMatchup {
  a: number; // rosterId
  b: number; // rosterId
}

export interface SimOptions {
  playoffTeams: number;
  currentWeek: number;
  regSeasonEnd: number;
  iterations?: number;
  /** Std dev of the score margin for one game. Default 22. */
  marginSd?: number;
}

export interface TeamSimResult {
  playoffPct: number;
  /** Null when the playoff format awards no byes. */
  byePct: number | null;
  champPct: number;
  expWins: number;
  expLosses: number;
  expTies: number;
}

const ITERATIONS = 10_000;
const MARGIN_SD = 22;

/** Standard normal CDF via the Abramowitz & Stegun erf approximation. */
function phi(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/** One draw from Normal(mean, sd) via Box-Muller. */
function gauss(mean: number, sd: number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

interface SimTeam {
  seed: SimTeamSeed;
  avgPF: number;
  avgPA: number;
}

export function simulateSeason(
  teams: SimTeamSeed[],
  weeks: Record<number, SimWeekMatchup[]>,
  opts: SimOptions,
): Record<number, TeamSimResult> {
  const iterations = opts.iterations ?? ITERATIONS;
  const sd = opts.marginSd ?? MARGIN_SD;
  const n = teams.length;
  const idx = new Map(teams.map((t, i) => [t.rosterId, i]));

  // Strength from scoring averages. A team with no completed games gets league
  // average strength (all such teams are coin flips against each other).
  const avgs = teams.map((t) => {
    const g = t.wins + t.losses + t.ties;
    return { pf: g > 0 ? t.pointsFor / g : NaN, pa: g > 0 ? t.pointsAgainst / g : NaN };
  });
  const playedAvgs = avgs.filter((a) => !Number.isNaN(a.pf));
  const leagueAvg = playedAvgs.length
    ? playedAvgs.reduce((s, a) => s + a.pf, 0) / playedAvgs.length
    : 100;
  const sim: SimTeam[] = teams.map((t, i) => ({
    seed: t,
    avgPF: Number.isNaN(avgs[i].pf) ? leagueAvg : avgs[i].pf,
    avgPA: Number.isNaN(avgs[i].pa) ? leagueAvg : avgs[i].pa,
  }));

  // Precompute per-game win probability and expected scores: strengths don't
  // change across iterations, so each matchup is simulated from fixed numbers.
  interface Game {
    ai: number;
    bi: number;
    expA: number;
    expB: number;
  }
  const games: Game[] = [];
  for (let w = opts.currentWeek; w <= opts.regSeasonEnd; w++) {
    for (const m of weeks[w] ?? []) {
      const ai = idx.get(m.a);
      const bi = idx.get(m.b);
      if (ai == null || bi == null || ai === bi) continue;
      const A = sim[ai];
      const B = sim[bi];
      const expA = A.avgPF + (leagueAvg - B.avgPA);
      const expB = B.avgPF + (leagueAvg - A.avgPA);
      games.push({ ai, bi, expA, expB });
    }
  }

  const playoffTeams = Math.max(0, Math.min(opts.playoffTeams, n));
  const byes = playoffTeams > 0 ? nextPow2(playoffTeams) - playoffTeams : 0;

  const playoffCount = new Array(n).fill(0);
  const byeCount = new Array(n).fill(0);
  const champCount = new Array(n).fill(0);
  const winSum = new Array(n).fill(0);
  const lossSum = new Array(n).fill(0);
  const tieSum = new Array(n).fill(0);

  const wins = new Array(n);
  const losses = new Array(n);
  const ties = new Array(n);
  const pf = new Array(n);

  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      wins[i] = sim[i].seed.wins;
      losses[i] = sim[i].seed.losses;
      ties[i] = sim[i].seed.ties;
      pf[i] = sim[i].seed.pointsFor;
    }
    for (const g of games) {
      const margin = gauss(g.expA - g.expB, sd);
      if (margin > 0) wins[g.ai]++;
      else if (margin < 0) wins[g.bi]++;
      else {
        ties[g.ai]++;
        ties[g.bi]++;
      }
      if (margin > 0) losses[g.bi]++;
      else if (margin < 0) losses[g.ai]++;
      pf[g.ai] += g.expA;
      pf[g.bi] += g.expB;
    }
    for (let i = 0; i < n; i++) {
      winSum[i] += wins[i];
      lossSum[i] += losses[i];
      tieSum[i] += ties[i];
    }

    if (playoffTeams <= 0) continue;
    // Standings: wins (+half for ties), then points-for.
    const order = [...Array(n).keys()].sort((x, y) => {
      const sx = wins[x] + ties[x] / 2;
      const sy = wins[y] + ties[y] / 2;
      if (sy !== sx) return sy - sx;
      return pf[y] - pf[x];
    });
    const field = order.slice(0, playoffTeams);
    for (const i of field) playoffCount[i]++;
    for (let s = 0; s < byes && s < field.length; s++) byeCount[field[s]]++;

    // Single-elim bracket. Round 1: everyone except the bye seeds plays, highest
    // remaining seed vs lowest. Bye teams rejoin in seed order for round 2+.
    const simGame = (x: number, y: number) => {
      const A = sim[x];
      const B = sim[y];
      const pA = phi((A.avgPF + (leagueAvg - B.avgPA) - (B.avgPF + (leagueAvg - A.avgPA))) / sd);
      return Math.random() < pA ? x : y;
    };
    const seedRank = new Map(field.map((ti, s) => [ti, s]));
    let alive: number[] = [];
    const firstRound = field.slice(byes);
    for (let lo = 0, hi = firstRound.length - 1; lo < hi; lo++, hi--) {
      alive.push(simGame(firstRound[lo], firstRound[hi]));
    }
    alive = [...field.slice(0, byes), ...alive].sort((x, y) => seedRank.get(x)! - seedRank.get(y)!);
    while (alive.length > 1) {
      const next: number[] = [];
      for (let lo = 0, hi = alive.length - 1; lo < hi; lo++, hi--) {
        next.push(simGame(alive[lo], alive[hi]));
      }
      alive = next;
    }
    if (alive.length === 1) champCount[alive[0]]++;
  }

  const out: Record<number, TeamSimResult> = {};
  for (let i = 0; i < n; i++) {
    out[teams[i].rosterId] = {
      playoffPct: playoffCount[i] / iterations,
      byePct: byes > 0 ? byeCount[i] / iterations : null,
      champPct: champCount[i] / iterations,
      expWins: winSum[i] / iterations,
      expLosses: lossSum[i] / iterations,
      expTies: tieSum[i] / iterations,
    };
  }
  return out;
}
