import { NextResponse } from "next/server";
import { sleeper, trimPlayers } from "@/lib/sleeper/client";
import { PROJ_CSV, TD_CSV, parseProjections, parseTdPct, matchToSleeper, GOLDEN_BOY_URL } from "@/lib/goldenboy";

export const dynamic = "force-dynamic";
const TTL = 60 * 30;

async function text(url: string) {
  const res = await fetch(url, { next: { revalidate: TTL }, headers: { accept: "text/csv,*/*" } });
  if (!res.ok) throw new Error(`Golden Boy sheet responded ${res.status}`);
  return res.text();
}

/** Golden Boy projections mapped to Sleeper ids. Falls back gracefully if the sheet is unreachable. */
export async function GET() {
  try {
    const [projCsv, tdCsv, raw] = await Promise.all([text(PROJ_CSV), text(TD_CSV).catch(() => ""), sleeper.playersRaw()]);
    const rows = parseProjections(projCsv);
    const { projections, unmatched } = matchToSleeper(rows, trimPlayers(raw), parseTdPct(tdCsv));
    return NextResponse.json(
      { projections, count: Object.keys(projections).length, rows: rows.length, unmatched, source: "Fantasy Golden Boy", url: GOLDEN_BOY_URL, fetchedAt: new Date().toISOString() },
      { headers: { "cache-control": "public, max-age=600, s-maxage=1800" } },
    );
  } catch (e) {
    return NextResponse.json({ projections: {}, count: 0, rows: 0, unmatched: [], source: "Fantasy Golden Boy", url: GOLDEN_BOY_URL, error: (e as Error).message }, { status: 200 });
  }
}
