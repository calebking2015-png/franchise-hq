import { NextRequest, NextResponse } from "next/server";
import { sleeper } from "@/lib/sleeper/client";
import { buildWeekRecap } from "@/lib/analysis/recap";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const leagueId = req.nextUrl.searchParams.get("leagueId");
  const week = Number(req.nextUrl.searchParams.get("week"));
  if (!leagueId || !week) return NextResponse.json({ error: "leagueId and week required" }, { status: 400 });
  try {
    const [matchups, rosters, users] = await Promise.all([sleeper.matchups(leagueId, week), sleeper.rosters(leagueId), sleeper.users(leagueId)]);
    if (!matchups?.length) return NextResponse.json({ recap: null, note: "No matchups for that week yet." });
    return NextResponse.json({ recap: buildWeekRecap(week, matchups, rosters ?? [], users ?? []), fetchedAt: new Date().toISOString() }, { headers: { "cache-control": "public, max-age=120, s-maxage=300" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
