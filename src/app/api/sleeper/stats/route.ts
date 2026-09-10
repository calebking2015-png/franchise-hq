import { NextRequest, NextResponse } from "next/server";
import { sleeper, trimStats } from "@/lib/sleeper/client";

export const dynamic = "force-dynamic";

/** Live weekly stat lines. Scored client-side under each league's settings. */
export async function GET(req: NextRequest) {
  try {
    let season = req.nextUrl.searchParams.get("season");
    let week = Number(req.nextUrl.searchParams.get("week"));
    if (!season || !week) {
      const st = await sleeper.state();
      season ??= st.league_season ?? st.season;
      if (!week) week = Math.max(1, st.display_week || st.week || 1);
    }
    const stats = trimStats(await sleeper.statsRaw(season, week));
    return NextResponse.json({ stats, season, week, count: Object.keys(stats).length, fetchedAt: new Date().toISOString() }, { headers: { "cache-control": "private, max-age=30" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
