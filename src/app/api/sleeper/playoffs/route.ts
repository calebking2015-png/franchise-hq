import { NextRequest, NextResponse } from "next/server";
import { sleeper } from "@/lib/sleeper/client";

export const dynamic = "force-dynamic";

export interface PlayoffScheduleRow {
  /** roster_id */
  r: number;
  /** opponent roster_id (null if no pairing published) */
  o: number | null;
  /** fantasy points scored that week (0 for future weeks) */
  p: number;
}

/**
 * Season schedule for playoff math: head-to-head pairings for every regular-season week.
 * Past weeks are immutable on Sleeper's side, so this is cheap to refetch; the per-week
 * matchup feed is cached by the sleeper client.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const end = Math.min(Math.max(Number(req.nextUrl.searchParams.get("end") ?? 14), 1), 18);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    const weeks: number[] = [];
    for (let w = 1; w <= end; w++) weeks.push(w);
    const results = await Promise.all(weeks.map((w) => sleeper.matchups(id, w)));
    const out: Record<number, PlayoffScheduleRow[]> = {};
    results.forEach((rows, i) => {
      const list = rows ?? [];
      out[weeks[i]] = list.map((m) => {
        const opp = list.find(
          (x) => x.matchup_id != null && x.matchup_id === m.matchup_id && x.roster_id !== m.roster_id,
        );
        return { r: m.roster_id, o: opp?.roster_id ?? null, p: m.points ?? 0 };
      });
    });
    return NextResponse.json({ weeks: out }, { headers: { "cache-control": "private, max-age=120" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
