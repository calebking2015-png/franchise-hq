import { NextRequest, NextResponse } from "next/server";
import { sleeper, trimProjections } from "@/lib/sleeper/client";

export const dynamic = "force-dynamic";

/** Weekly projections, trimmed to fantasy-relevant players. Defaults to the live NFL week. */
export async function GET(req: NextRequest) {
  try {
    let season = req.nextUrl.searchParams.get("season");
    let week = Number(req.nextUrl.searchParams.get("week"));
    if (!season || !week) {
      const st = await sleeper.state();
      season ??= st.league_season ?? st.season;
      if (!week) week = st.season_type === "pre" ? 1 : Math.max(1, st.display_week || st.week || 1);
    }
    const projections = trimProjections(await sleeper.projectionsRaw(season, week));
    return NextResponse.json(
      { projections, season, week, count: Object.keys(projections).length, source: "Sleeper / Rotowire", fetchedAt: new Date().toISOString() },
      { headers: { "cache-control": "public, max-age=600, s-maxage=1800" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
