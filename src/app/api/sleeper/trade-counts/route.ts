import { NextRequest, NextResponse } from "next/server";
import { sleeper } from "@/lib/sleeper/client";
import { seasonChain, seasonWeeks, isCompleteTrade, tradePlayerIds } from "@/lib/sleeper/trade-history";

export const dynamic = "force-dynamic";

export interface TradeCountsResponse {
  counts: Record<string, { count: number; lastWeek: number; lastSeason?: string }>;
  seasons: string[];
}

type Counts = TradeCountsResponse["counts"];

function addTrade(
  txs: Awaited<ReturnType<typeof sleeper.transactions>>,
  week: number,
  season: string,
  counts: Counts,
) {
  for (const tx of txs ?? []) {
    if (!isCompleteTrade(tx)) continue;
    for (const pid of tradePlayerIds(tx)) {
      const e = counts[pid] ?? { count: 0, lastWeek: 0, lastSeason: season };
      e.count += 1;
      if (season > (e.lastSeason ?? "") || (season === e.lastSeason && week > e.lastWeek)) {
        e.lastSeason = season;
        e.lastWeek = week;
      }
      counts[pid] = e;
    }
  }
}

/**
 * Per-player trade counts.
 * - scope=season (default): weeks 1..throughWeek of the given league id.
 * - scope=alltime: walks the previous_league_id chain and counts trades across every
 *   season found (weeks 0..18 for prior seasons, 1..throughWeek for the current one).
 * Each player is counted once per trade transaction.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const throughWeek = Number(req.nextUrl.searchParams.get("throughWeek") ?? 1);
  const alltime = req.nextUrl.searchParams.get("scope") === "alltime";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    const chain = alltime ? await seasonChain(id) : [{ leagueId: id, season: "" }];
    if (chain.length === 0) return NextResponse.json({ error: "league not found" }, { status: 404 });

    const results = await Promise.all(
      chain.map(async (s) => {
        const weeks = seasonWeeks(s, chain[0].leagueId, throughWeek, alltime);
        return { season: s.season, weeks, txByWeek: await Promise.all(weeks.map((w) => sleeper.transactions(s.leagueId, w))) };
      }),
    );

    const counts: Counts = {};
    for (const r of results) {
      r.txByWeek.forEach((txs, i) => addTrade(txs, r.weeks[i], r.season, counts));
    }
    const seasons = [...new Set(chain.map((s) => s.season).filter(Boolean))].sort();
    const body: TradeCountsResponse = { counts, seasons };
    return NextResponse.json(body, { headers: { "cache-control": "private, max-age=120" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
