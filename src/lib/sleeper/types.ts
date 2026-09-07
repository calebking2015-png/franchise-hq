/**
 * Types for Sleeper's documented public API (https://docs.sleeper.com).
 * Read-only. Only documented endpoints are used.
 */

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperNflState {
  week: number;
  display_week: number;
  season: string;
  season_type: "pre" | "regular" | "post" | string;
  league_season: string;
  previous_season: string;
  leg: number;
  season_start_date: string;
}

export type SleeperRosterSlot =
  | "QB" | "RB" | "WR" | "TE" | "K" | "DEF"
  | "FLEX" | "SUPER_FLEX" | "REC_FLEX" | "WRRB_FLEX" | "IDP_FLEX"
  | "DL" | "LB" | "DB" | "BN" | "IR" | "TAXI" | string;

export interface SleeperLeagueSettings {
  type?: number; // 0 redraft, 1 keeper, 2 dynasty
  num_teams?: number;
  playoff_teams?: number;
  playoff_week_start?: number;
  taxi_slots?: number;
  taxi_years?: number;
  taxi_allow_vets?: number;
  reserve_slots?: number;
  reserve_allow_out?: number;
  reserve_allow_doubtful?: number;
  reserve_allow_sus?: number;
  reserve_allow_cov?: number;
  reserve_allow_na?: number;
  waiver_type?: number; // 0 rolling, 1 reverse standings, 2 FAAB
  waiver_budget?: number;
  waiver_day_of_week?: number;
  waiver_clear_days?: number;
  trade_deadline?: number;
  best_ball?: number;
  draft_rounds?: number;
  leg?: number;
  [key: string]: number | undefined;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  season_type: string;
  status: "pre_draft" | "drafting" | "in_season" | "complete" | string;
  sport: "nfl";
  total_rosters: number;
  roster_positions: SleeperRosterSlot[];
  scoring_settings: Record<string, number>;
  settings: SleeperLeagueSettings;
  previous_league_id: string | null;
  draft_id: string | null;
  avatar: string | null;
  metadata?: Record<string, string> | null;
}

export interface SleeperRosterSettings {
  wins: number;
  losses: number;
  ties: number;
  fpts?: number;
  fpts_decimal?: number;
  fpts_against?: number;
  fpts_against_decimal?: number;
  waiver_position?: number;
  waiver_budget_used?: number;
  total_moves?: number;
  division?: number;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners?: string[] | null;
  league_id: string;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  settings: SleeperRosterSettings;
  metadata?: Record<string, string> | null;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  is_owner?: boolean | null;
  metadata?: { team_name?: string; avatar?: string; [k: string]: string | undefined } | null;
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  custom_points?: number | null;
  starters: string[] | null;
  players: string[] | null;
  starters_points?: number[] | null;
  players_points?: Record<string, number> | null;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  roster_id: number; // original owner
  previous_owner_id: number;
  owner_id: number; // current owner
}

export interface SleeperTransaction {
  transaction_id: string;
  type: "trade" | "free_agent" | "waiver" | string;
  status: string;
  created: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks?: SleeperTradedPick[];
  waiver_budget?: { sender: number; receiver: number; amount: number }[];
  settings?: { waiver_bid?: number; seq?: number } | null;
}

export interface SleeperTrendingPlayer {
  player_id: string;
  count: number;
}

export type InjuryStatus =
  | "Questionable" | "Doubtful" | "Out" | "IR" | "PUP" | "Sus" | "COV" | "NA" | "DNR" | string;

/** Full Sleeper player record (only the fields we keep). */
export interface SleeperPlayerRaw {
  player_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  position?: string | null;
  fantasy_positions?: string[] | null;
  team?: string | null;
  status?: string | null; // "Active" | "Inactive" | "Injured Reserve" | ...
  injury_status?: InjuryStatus | null;
  injury_body_part?: string | null;
  injury_notes?: string | null;
  age?: number | null;
  years_exp?: number | null;
  number?: number | null;
  depth_chart_order?: number | null;
  depth_chart_position?: string | null;
  active?: boolean;
  search_rank?: number | null;
}

/** Trimmed player shape served to the client (cached ~24h). */
export interface Player {
  id: string;
  name: string;
  first: string;
  last: string;
  pos: string; // primary fantasy position
  team: string | null;
  status: string | null;
  injury: InjuryStatus | null;
  injuryPart: string | null;
  age: number | null;
  exp: number | null;
  number: number | null;
  depth: number | null;
  active: boolean;
  rank: number | null; // Sleeper search_rank (Sleeper data, not a projection)
}

export type PlayerMap = Record<string, Player>;
