import type { SleeperLeague, SleeperRosterSlot } from "@/lib/sleeper/types";
import { receptionValue } from "@/lib/scoring/engine";

export type LeagueKind = "redraft" | "dynasty" | "keeper";
export type ScoringLabel = "PPR" | "Half PPR" | "Standard" | "Custom";
export type WaiverKind = "FAAB" | "Rolling" | "Reverse standings" | "Unknown";

export interface SlotCount { slot: string; count: number }

export interface LeagueFormat {
  kind: LeagueKind;
  isDynasty: boolean;
  teams: number;
  scoring: ScoringLabel;
  ppr: number;
  tePremium: number; // extra points per TE reception
  superflex: boolean;
  qbSlots: number; // QB + SUPER_FLEX
  starters: SlotCount[]; // starting slots excluding BN/IR/TAXI
  starterCount: number;
  benchSlots: number;
  irSlots: number;
  taxiSlots: number;
  waiver: WaiverKind;
  faabBudget: number | null;
  playoffTeams: number | null;
  playoffStart: number | null;
  tradeDeadline: number | null;
  passTd: number;
  /** Which positions each starting slot accepts. */
  eligibility: Record<string, string[]>;
}

export const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

export const SLOT_LABEL: Record<string, string> = {
  SUPER_FLEX: "SFLX", WRRB_FLEX: "W/R", REC_FLEX: "W/T", FLEX: "FLX", DEF: "DST", BN: "BN", IR: "IR", TAXI: "TAXI",
};

const NON_STARTING = new Set<SleeperRosterSlot>(["BN", "IR", "TAXI"]);

export function deriveFormat(league: SleeperLeague): LeagueFormat {
  const s = league.settings ?? {};
  const sc = league.scoring_settings ?? {};
  const rp = league.roster_positions ?? [];

  const kind: LeagueKind = s.type === 2 ? "dynasty" : s.type === 1 ? "keeper" : "redraft";
  const ppr = sc.rec ?? 0;
  const scoring: ScoringLabel =
    ppr === 1 ? "PPR" : ppr === 0.5 ? "Half PPR" : ppr === 0 ? "Standard" : "Custom";
  const tePremium = receptionValue(sc, "TE") - ppr;

  const counts = new Map<string, number>();
  for (const slot of rp) counts.set(slot, (counts.get(slot) ?? 0) + 1);
  const starters: SlotCount[] = [...counts.entries()]
    .filter(([slot]) => !NON_STARTING.has(slot))
    .map(([slot, count]) => ({ slot, count }));

  const qbSlots = (counts.get("QB") ?? 0) + (counts.get("SUPER_FLEX") ?? 0);
  const waiver: WaiverKind =
    s.waiver_type === 2 ? "FAAB" : s.waiver_type === 1 ? "Reverse standings" : s.waiver_type === 0 ? "Rolling" : "Unknown";

  return {
    kind,
    isDynasty: kind === "dynasty",
    teams: league.total_rosters ?? s.num_teams ?? 0,
    scoring,
    ppr,
    tePremium: Math.round(tePremium * 100) / 100,
    superflex: (counts.get("SUPER_FLEX") ?? 0) > 0,
    qbSlots,
    starters,
    starterCount: starters.reduce((n, x) => n + x.count, 0),
    benchSlots: counts.get("BN") ?? 0,
    irSlots: s.reserve_slots ?? counts.get("IR") ?? 0,
    taxiSlots: s.taxi_slots ?? counts.get("TAXI") ?? 0,
    waiver,
    faabBudget: s.waiver_type === 2 ? s.waiver_budget ?? 100 : null,
    playoffTeams: s.playoff_teams ?? null,
    playoffStart: s.playoff_week_start ?? null,
    tradeDeadline: s.trade_deadline ?? null,
    passTd: sc.pass_td ?? 4,
    eligibility: SLOT_ELIGIBILITY,
  };
}

/** Short human label like "12-tm · Half PPR · SF · TEP". */
export function formatSummary(f: LeagueFormat): string[] {
  const parts = [`${f.teams}-team`, f.scoring];
  parts.push(f.superflex ? "Superflex" : "1QB");
  if (f.tePremium > 0) parts.push(`TE +${f.tePremium}`);
  return parts;
}

/** Expand roster_positions into the ordered starting slot list Sleeper uses for `starters`. */
export function startingSlots(league: SleeperLeague): string[] {
  return (league.roster_positions ?? []).filter((s) => !NON_STARTING.has(s));
}

export function slotLabel(slot: string) {
  return SLOT_LABEL[slot] ?? slot;
}

export function slotAccepts(slot: string, pos: string) {
  return (SLOT_ELIGIBILITY[slot] ?? [slot]).includes(pos);
}
