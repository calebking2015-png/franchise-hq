/**
 * Scoring engine: converts a raw stat line into fantasy points using a
 * league's actual `scoring_settings` from Sleeper. Never assumes PPR.
 *
 * Sleeper stat keys match its scoring_settings keys, so a projection provider
 * that emits Sleeper-style stat names plugs straight in.
 */

export type StatLine = Partial<Record<string, number>>;

/** Keys we understand. Anything else in scoring_settings still scores 1:1 by key match. */
export const STAT_KEYS = {
  passing: ["pass_yd", "pass_td", "pass_int", "pass_2pt", "pass_att", "pass_cmp", "pass_inc", "pass_sack", "pass_cmp_40p", "pass_td_40p", "pass_td_50p"],
  rushing: ["rush_yd", "rush_td", "rush_2pt", "rush_att", "rush_40p", "rush_td_40p", "rush_td_50p"],
  receiving: ["rec", "rec_yd", "rec_td", "rec_2pt", "rec_40p", "rec_td_40p", "rec_td_50p", "rec_0_4", "rec_5_9", "rec_10_19", "rec_20_29", "rec_30_39"],
  misc: ["fum", "fum_lost", "fum_rec_td", "st_td", "st_fum_rec", "st_ff"],
  kicking: ["xpm", "xpmiss", "fgm", "fgmiss", "fgm_0_19", "fgm_20_29", "fgm_30_39", "fgm_40_49", "fgm_50p", "fgm_yds"],
  dst: ["def_td", "sack", "int", "ff", "fum_rec", "safe", "blk_kick", "def_st_td", "def_st_fum_rec", "def_st_ff", "pts_allow_0", "pts_allow_1_6", "pts_allow_7_13", "pts_allow_14_20", "pts_allow_21_27", "pts_allow_28_34", "pts_allow_35p", "yds_allow_0_100", "yds_allow_100_199", "yds_allow_200_299", "yds_allow_300_349", "yds_allow_350_399", "yds_allow_400_449", "yds_allow_450_499", "yds_allow_500_549", "yds_allow_550p"],
} as const;

/** Yardage-threshold bonuses Sleeper expresses as boolean-ish stats. */
const BONUS_KEYS = [
  "bonus_pass_yd_300", "bonus_pass_yd_400", "bonus_rush_yd_100", "bonus_rush_yd_200",
  "bonus_rec_yd_100", "bonus_rec_yd_200", "bonus_rush_att_20", "bonus_rec_rb", "bonus_rec_wr", "bonus_rec_te",
  "bonus_pass_cmp_25", "bonus_rush_rec_yd_100", "bonus_rush_rec_yd_200",
];

export interface ScoreBreakdownItem { key: string; stat: number; weight: number; points: number }
export interface ScoreResult { points: number; breakdown: ScoreBreakdownItem[] }

/**
 * Score a stat line for a given position under a league's scoring settings.
 * Position matters for per-position reception bonuses (TE premium).
 */
export function scoreStatLine(
  stats: StatLine,
  scoring: Record<string, number>,
  position: string,
): ScoreResult {
  const breakdown: ScoreBreakdownItem[] = [];
  let total = 0;

  const add = (key: string, stat: number | undefined, weight: number | undefined) => {
    if (!stat || !weight) return;
    const pts = stat * weight;
    total += pts;
    breakdown.push({ key, stat, weight, points: pts });
  };

  // Direct key matches (pass_yd, rec, rush_td, sack, fgm_50p, ...).
  for (const [key, weight] of Object.entries(scoring)) {
    if (BONUS_KEYS.includes(key)) continue;
    add(key, stats[key], weight);
  }

  // Derived threshold bonuses.
  const derived: Record<string, boolean> = {
    bonus_pass_yd_300: (stats.pass_yd ?? 0) >= 300,
    bonus_pass_yd_400: (stats.pass_yd ?? 0) >= 400,
    bonus_rush_yd_100: (stats.rush_yd ?? 0) >= 100,
    bonus_rush_yd_200: (stats.rush_yd ?? 0) >= 200,
    bonus_rec_yd_100: (stats.rec_yd ?? 0) >= 100,
    bonus_rec_yd_200: (stats.rec_yd ?? 0) >= 200,
    bonus_rush_att_20: (stats.rush_att ?? 0) >= 20,
    bonus_pass_cmp_25: (stats.pass_cmp ?? 0) >= 25,
    bonus_rush_rec_yd_100: (stats.rush_yd ?? 0) + (stats.rec_yd ?? 0) >= 100,
    bonus_rush_rec_yd_200: (stats.rush_yd ?? 0) + (stats.rec_yd ?? 0) >= 200,
  };
  for (const [key, hit] of Object.entries(derived)) {
    if (hit && scoring[key]) add(key, 1, scoring[key]);
  }

  // Per-position reception premiums (TE premium etc.).
  const posRec = scoring[`bonus_rec_${position.toLowerCase()}`];
  if (posRec) add(`bonus_rec_${position.toLowerCase()}`, stats.rec, posRec);

  return { points: Math.round(total * 100) / 100, breakdown };
}

/** Points-per-reception for a position, including TE premium. */
export function receptionValue(scoring: Record<string, number>, position: string): number {
  return (scoring.rec ?? 0) + (scoring[`bonus_rec_${position.toLowerCase()}`] ?? 0);
}
