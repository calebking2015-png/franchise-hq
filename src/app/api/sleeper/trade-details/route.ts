import { NextRequest, NextResponse } from "next/server";
import { sleeper } from "@/lib/sleeper/client";
import { seasonChain, seasonWeeks, isCompleteTrade, tradePlayerIds, compareSeasonWeek } from "@/lib/sleeper/trade-history";
import type { SleeperTransaction } from "@/lib/sleeper/types";

export const dynamic = "force-dynamic";

export interface TradePickMove {
  season: string;
  round: number;
  /** Roster that gave the pick up in this trade (previous_owner_id). */
  fromRosterId: number;
  /** Roster that originally owned the pick (roster_id) — differs when the pick had been flipped before. */
  origRosterId: number;
}

export interface TradeDetailTeam {
  rosterId: number;
  teamName: string;
  isMe: boolean;
  receivedPlayers: string[];
  gavePlayers: string[];
  receivedPicks: TradePickMove[];
  gavePicks: TradePickMove[];
}

export interface TradeDetail {
  season: string;
  week: number;
  teams: TradeDetailTeam[];
}

export interface TradeDetailsResponse {
  playerId: string;
  trades: TradeDetail[];
  seasons: string[];
}

interface SeasonTeam {
  rosterId: number;
  ownerId: string | null;
  teamName: string;
}

/** Resolve roster_id -> display name for one season (owners change across seasons, so per-season). */
async function seasonTeams(leagueId: string): Promise<SeasonTeam[]> {
  const [users, rosters] = await Promise.all([sleeper.users(leagueId), sleeper.rosters(leagueId)]);
  const nameByUser = new Map<string, string>();
  for (const u of users ?? []) nameByUser.set(u.user_id, u.metadata?.team_name?.trim() || u.display_name);
  return (rosters ?? []).map((r) => ({
    rosterId: r.roster_id,
    ownerId: r.owner_id,
    teamName: (r.owner_id ? nameByUser.get(r.owner_id) : undefined) ?? `Team ${r.roster_id}`,
  }));
}

const NUMERIC = /^\d+$/;

function buildDetail(
  tx: SleeperTransaction,
  season: string,
  week: number,
  teams: SeasonTeam[],
  myOwnerId: string | null,
): TradeDetail {
  const pickMoves = (tx.draft_picks ?? []).map((p) => ({
    season: p.season,
    round: p.round,
    ownerId: p.owner_id,
    fromRosterId: p.previous_owner_id,
    origRosterId: p.roster_id,
  }));
  const rosterIds = tx.roster_ids?.length
    ? tx.roster_ids
    : [...new Set([...Object.values(tx.adds ?? {}), ...Object.values(tx.drops ?? {}), ...pickMoves.map((p) => p.ownerId)])];
  return {
    season,
    week,
    teams: rosterIds.map((rid) => {
      const meta = teams.find((t) => t.rosterId === rid);
      const receivedPlayers = Object.entries(tx.adds ?? {})
        .filter(([pid, r]) => r === rid && NUMERIC.test(pid))
        .map(([pid]) => pid);
      const gavePlayers = Object.entries(tx.drops ?? {})
        .filter(([pid, r]) => r === rid && NUMERIC.test(pid))
        .map(([pid]) => pid);
      return {
        rosterId: rid,
        teamName: meta?.teamName ?? `Team ${rid}`,
        isMe: !!myOwnerId && meta?.ownerId === myOwnerId,
        receivedPlayers,
        gavePlayers,
        receivedPicks: pickMoves
          .filter((p) => p.ownerId === rid)
          .map(({ season, round, fromRosterId, origRosterId }) => ({ season, round, fromRosterId, origRosterId })),
        gavePicks: pickMoves
          .filter((p) => p.fromRosterId === rid && p.ownerId !== rid)
          .map(({ season, round, fromRosterId, origRosterId }) => ({ season, round, fromRosterId, origRosterId })),
      };
    }),
  };
}

/**
 * Every completed trade involving one player.
 * - scope=alltime: walks the previous_league_id chain (weeks 0..18 prior seasons).
 * - default: weeks 1..throughWeek of the given league id.
 * Team names resolve per season since ownership changes year to year.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const playerId = req.nextUrl.searchParams.get("playerId");
  const throughWeek = Number(req.nextUrl.searchParams.get("throughWeek") ?? 1);
  const alltime = req.nextUrl.searchParams.get("scope") === "alltime";
  const myRosterId = Number(req.nextUrl.searchParams.get("myRosterId") ?? NaN);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!playerId) return NextResponse.json({ error: "playerId is required" }, { status: 400 });
  try {
    const chain = await seasonChain(id);
    if (chain.length === 0) return NextResponse.json({ error: "league not found" }, { status: 404 });
    const seasons = alltime ? chain : chain.slice(0, 1);
    const currentId = chain[0].leagueId;

    const perSeason = await Promise.all(
      seasons.map(async (s) => {
        const weeks = seasonWeeks(s, currentId, throughWeek, alltime);
        const [txByWeek, teams] = await Promise.all([
          Promise.all(weeks.map((w) => sleeper.transactions(s.leagueId, w))),
          seasonTeams(s.leagueId),
        ]);
        return { season: s.season, weeks, txByWeek, teams };
      }),
    );

    // Resolve my owner id from the current season's rosters so isMe works across seasons.
    let myOwnerId: string | null = null;
    if (Number.isFinite(myRosterId)) {
      const current = perSeason.find((p) => p.season === chain[0].season);
      myOwnerId = current?.teams.find((t) => t.rosterId === myRosterId)?.ownerId ?? null;
    }

    const trades: TradeDetail[] = [];
    for (const p of perSeason) {
      p.txByWeek.forEach((txs, i) => {
        for (const tx of txs ?? []) {
          if (!isCompleteTrade(tx)) continue;
          if (!tradePlayerIds(tx).includes(playerId)) continue;
          trades.push(buildDetail(tx, p.season, p.weeks[i], p.teams, myOwnerId));
        }
      });
    }
    trades.sort((a, b) => compareSeasonWeek(a.season, a.week, b.season, b.week));

    const body: TradeDetailsResponse = {
      playerId,
      trades,
      seasons: [...new Set(seasons.map((s) => s.season).filter(Boolean))].sort(),
    };
    return NextResponse.json(body, { headers: { "cache-control": "private, max-age=120" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
