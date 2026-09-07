import { NextRequest, NextResponse } from "next/server";
import { sleeper } from "@/lib/sleeper/client";
import { buildSchedule } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    let season = req.nextUrl.searchParams.get("season");
    if (!season) { const st = await sleeper.state(); season = st.league_season ?? st.season; }
    const schedule = buildSchedule(await sleeper.scheduleRaw(season));
    return NextResponse.json({ schedule, season, fetchedAt: new Date().toISOString() }, { headers: { "cache-control": "public, max-age=60, s-maxage=120" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
