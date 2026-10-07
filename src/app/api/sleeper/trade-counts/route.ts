import { NextRequest, NextResponse } from "next/server";
import { sleeper } from "@/lib/sleeper/client";
import type { SleeperTransaction } from "@/lib/sleeper/types";

export const dynamic = "force-dynamic";

export interface TradeCountsResponse {
  counts: Record<string, { count: number; lastWeek: number; lastSeason?: string }>;
  seasons: string[];
}

type Counts = TradeCountsResponse["counts"];

function addTrade(txs: SleeperTransaction[] | null, week: number, season: string, counts: Counts) {
  for (const tx of txs ?? []) {
    if (tx.type !== "trade") continue;
    if (tx.status && tx.status !== "complete") continue;
    const ids = new Set<string>([...Object.keys(tx.adds ?? {}), ...Object.keys(tx.drops ?? {})]);
    for (const pid of ids) {
      if (!/^\d+$/.test(pid)) continue; // skip draft picks / non-player keys
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

interface SeasonEntry {
  leagueId: string;
  season: string;
}

/** Walk previous_league_id back through prior seasons. Guards against cycles and runaway chains. */
async function seasonChain(startId: string): Promise<SeasonEntry[]> {
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
 * Per-player trade counts.
 * - scope=this-season (default): weeks 1..throughWeek of the given league id.
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
    let chain: SeasonEntry[];
    let weeksFor: (s: SeasonEntry) => number[];
    if (alltime) {
      chain = await seasonChain(id);
      if (chain.length === 0) return NextResponse.json({ error: "league not found" }, { status: 404 });
      const current = chain[0];
      weeksFor = (s) =>
        s.leagueId === current.leagueId
          ? Array.from({ length: Math.max(throughWeek, 1) }, (_, i) => i + 1)
          : Array.from({ length: 19 }, (_, i) => i); // weeks 0..18; week 0 may 404 (returns null, tolerated)
    } else {
      chain = [{ leagueId: id, season: "" }];
      weeksFor = () => Array.from({ length: Math.max(throughWeek, 1) }, (_, i) => i + 1);
    }

    const jobs = chain.map((s) => ({ season: s.season, weeks: weeksFor(s), leagueId: s.leagueId }));
    const results = await Promise.all(
      jobs.map(async (j) => ({
        season: j.season,
        weeks: j.weeks,
        txByWeek: await Promise.all(j.weeks.map((w) => sleeper.transactions(j.leagueId, w))),
      })),
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
