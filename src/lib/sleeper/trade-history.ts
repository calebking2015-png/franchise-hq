/**
 * Shared helpers for trade-history features (trade counts, trade details).
 * Season-chain walking and per-transaction player extraction live here so the
 * API routes stay thin.
 */
import { sleeper } from "./client";
import type { SleeperTransaction } from "./types";

export interface SeasonEntry {
  leagueId: string;
  season: string;
}

/** Walk previous_league_id back through prior seasons. Guards against cycles and runaway chains. */
export async function seasonChain(startId: string): Promise<SeasonEntry[]> {
  const chain: SeasonEntry[] = [];
  const seen = new Set<string>();
  let id: string | null = startId;
  while (id && !seen.has(id) && chain.length < 20) {
    seen.add(id);
    const league = await sleeper.league(id);
    if (!league) break;
    chain.push({ leagueId: id, season: league.season ?? "" });
    id = league.previous_league_id;
  }
  return chain;
}

/**
 * Weeks to scan for a season entry. Current season: weeks 1..throughWeek.
 * Prior seasons: weeks 0..18 (week 0 may 404 — the client returns null, tolerated).
 * Non-alltime mode: same as current season.
 */
export function seasonWeeks(entry: SeasonEntry, currentId: string, throughWeek: number, alltime: boolean): number[] {
  if (!alltime || entry.leagueId === currentId) {
    return Array.from({ length: Math.max(throughWeek, 1) }, (_, i) => i + 1);
  }
  return Array.from({ length: 19 }, (_, i) => i);
}

/** Defensive completed-trade guard: a present-but-unknown status doesn't exclude the trade. */
export function isCompleteTrade(tx: SleeperTransaction): boolean {
  return tx.type === "trade" && (!tx.status || tx.status === "complete");
}

/** Numeric player IDs moved in a trade transaction (draft picks / non-player keys skipped). */
export function tradePlayerIds(tx: SleeperTransaction): string[] {
  const ids = new Set<string>([...Object.keys(tx.adds ?? {}), ...Object.keys(tx.drops ?? {})]);
  return [...ids].filter((id) => /^\d+$/.test(id));
}

/** Newest-first ordering across seasons, then weeks. Seasons compare numerically when possible. */
export function compareSeasonWeek(aSeason: string, aWeek: number, bSeason: string, bWeek: number): number {
  const an = Number(aSeason);
  const bn = Number(bSeason);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return bn - an;
  if (aSeason !== bSeason) return bSeason.localeCompare(aSeason);
  return bWeek - aWeek;
}
