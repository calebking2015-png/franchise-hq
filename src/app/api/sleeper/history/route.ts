import { NextRequest, NextResponse } from "next/server";
import { sleeper } from "@/lib/sleeper/client";
import { buildSeasonRecap } from "@/lib/analysis/recap";

export const dynamic = "force-dynamic";

/** Walk previous_league_id back through every season of a (dynasty) league and recap each. */
export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("leagueId");
  if (!start) return NextResponse.json({ error: "leagueId required" }, { status: 400 });
  try {
    const seasons = [];
    let id: string | null = start;
    let guard = 0;
    while (id && guard++ < 20) {
      const league = await sleeper.league(id);
      if (!league) break;
      const [rosters, users, bracket] = await Promise.all([
        sleeper.rosters(id), sleeper.users(id), sleeper.winnersBracket(id).catch(() => null),
      ]);
      seasons.push(buildSeasonRecap(league, rosters ?? [], users ?? [], bracket));
      id = league.previous_league_id;
    }
    return NextResponse.json({ seasons, count: seasons.length, fetchedAt: new Date().toISOString() }, { headers: { "cache-control": "public, max-age=1800, s-maxage=3600" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
