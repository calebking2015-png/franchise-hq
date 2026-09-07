import { NextRequest, NextResponse } from "next/server";
import { sleeper } from "@/lib/sleeper/client";
import type { LeagueDetail } from "@/lib/portfolio/types";

export const dynamic = "force-dynamic";

/** League Hub extras: recent transactions, traded picks, full week matchups. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const week = Number(req.nextUrl.searchParams.get("week") ?? 1);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    const weeks = [week, week - 1, week - 2].filter((w) => w >= 1);
    const [txByWeek, picks, matchups] = await Promise.all([
      Promise.all(weeks.map((w) => sleeper.transactions(id, w))),
      sleeper.tradedPicks(id),
      week > 0 ? sleeper.matchups(id, week) : Promise.resolve(null),
    ]);
    const transactions = txByWeek.flatMap((t) => t ?? []).sort((a, b) => b.created - a.created);
    const detail: LeagueDetail = { transactions, tradedPicks: picks ?? [], matchups: matchups ?? [] };
    return NextResponse.json(detail, { headers: { "cache-control": "private, max-age=120" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
