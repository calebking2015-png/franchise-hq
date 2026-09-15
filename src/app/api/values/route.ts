import { NextRequest, NextResponse } from "next/server";
import { toValueMap, type FCPlayer } from "@/lib/values";

export const dynamic = "force-dynamic";
const TTL = 60 * 60 * 6; // values move slowly; 6h is plenty

/** Proxy + cache FantasyCalc for one format. Params: isDynasty, numQbs, numTeams, ppr. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const isDynasty = sp.get("isDynasty") === "true";
  const numQbs = Number(sp.get("numQbs") ?? 1);
  const numTeams = Number(sp.get("numTeams") ?? 12);
  const ppr = Number(sp.get("ppr") ?? 0.5);
  const url = `https://api.fantasycalc.com/values/current?isDynasty=${isDynasty}&numQbs=${numQbs}&numTeams=${numTeams}&ppr=${ppr}`;
  try {
    const res = await fetch(url, { next: { revalidate: TTL }, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`FantasyCalc responded ${res.status}`);
    const rows = (await res.json()) as FCPlayer[];
    return NextResponse.json(
      { values: toValueMap(rows), count: rows.length, source: "FantasyCalc", url: "https://fantasycalc.com", fetchedAt: new Date().toISOString() },
      { headers: { "cache-control": "public, max-age=3600, s-maxage=21600" } },
    );
  } catch (e) {
    return NextResponse.json({ values: {}, count: 0, source: "FantasyCalc", error: (e as Error).message }, { status: 200 });
  }
}
