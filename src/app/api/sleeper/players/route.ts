import { NextResponse } from "next/server";
import { sleeper, trimPlayers } from "@/lib/sleeper/client";

export const dynamic = "force-dynamic";

/**
 * Trimmed NFL player database. Sleeper asks that the full dump be pulled at most
 * once a day; the fetch is cached server-side for 24h and the trimmed response is
 * cacheable at the edge/browser for an hour.
 */
export async function GET() {
  try {
    const raw = await sleeper.playersRaw();
    const players = trimPlayers(raw);
    return NextResponse.json(
      { players, count: Object.keys(players).length, fetchedAt: new Date().toISOString() },
      { headers: { "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
