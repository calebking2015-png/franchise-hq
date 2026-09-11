import { NextRequest, NextResponse } from "next/server";
import { sleeper, trimStats } from "@/lib/sleeper/client";
import type { StatsMap } from "@/lib/sleeper/types";

export const dynamic = "force-dynamic";

/** Actual weekly stats for weeks 1..throughWeek, for the buy-low/sell-high engine. */
export async function GET(req: NextRequest) {
  try {
    let season = req.nextUrl.searchParams.get("season");
    let through = Number(req.nextUrl.searchParams.get("through"));
    if (!season || !through) {
      const st = await sleeper.state();
      season ??= st.league_season ?? st.season;
      if (!through) through = st.season_type === "pre" ? 0 : Math.max(1, (st.display_week || st.week || 1));
    }
    const weeks = Array.from({ length: through }, (_, i) => i + 1);
    const results = await Promise.all(weeks.map((w) => sleeper.weekStatsRaw(season!, w).then(trimStats).catch(() => ({} as StatsMap))));
    const weekly: Record<number, StatsMap> = {};
    weeks.forEach((w, i) => (weekly[w] = results[i]));
    return NextResponse.json({ weekly, season, through, fetchedAt: new Date().toISOString() }, { headers: { "cache-control": "public, max-age=300, s-maxage=900" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
