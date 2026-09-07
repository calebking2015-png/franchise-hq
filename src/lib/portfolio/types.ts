import type { LeagueFormat } from "@/lib/league/format";
import type {
  SleeperLeague, SleeperNflState, SleeperRoster, SleeperUser, SleeperMatchup, SleeperTradedPick, SleeperTransaction,
} from "@/lib/sleeper/types";
import type { ProviderStatus } from "@/lib/providers";
import type { PlayerMap } from "@/lib/sleeper/types";

export interface TeamInfo {
  rosterId: number;
  ownerId: string | null;
  ownerName: string;
  teamName: string;
  avatar: string | null;
  record: { wins: number; losses: number; ties: number };
  pointsFor: number;
  pointsAgainst: number;
  waiverPosition: number | null;
  faabUsed: number | null;
  standing: number; // 1-based, by record then points for
}

export interface MyMatchup {
  matchupId: number | null;
  myPoints: number;
  oppRosterId: number | null;
  oppPoints: number | null;
  myStarters: string[];
  oppStarters: string[];
  myStarterPoints: number[];
  oppStarterPoints: number[];
}

export interface LeagueBundle {
  league: SleeperLeague;
  format: LeagueFormat;
  teams: TeamInfo[]; // sorted by standing
  myRosterId: number | null;
  myRoster: SleeperRoster | null;
  rosters: SleeperRoster[];
  matchup: MyMatchup | null;
  /** All rostered player ids in this league -> roster id (for availability). */
  ownership: Record<string, number>;
  week: number;
}

export interface Portfolio {
  user: SleeperUser;
  state: SleeperNflState;
  season: string;
  week: number;
  leagues: LeagueBundle[];
  providers: ProviderStatus;
  /** Rostered players in your leagues that fall outside the trimmed public player set (retired, inactive). */
  extraPlayers: PlayerMap;
  fetchedAt: string;
  warnings: string[];
}

export interface LeagueDetail {
  transactions: SleeperTransaction[];
  tradedPicks: SleeperTradedPick[];
  matchups: SleeperMatchup[];
}
