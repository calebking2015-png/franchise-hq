import { NextRequest, NextResponse } from "next/server";
import { sleeper } from "@/lib/sleeper/client";

export const dynamic = "force-dynamic";

export interface TradeCountsResponse {
  counts: Record<string, { count: number; lastWeek: number }>;
}

/** Per-player trade counts across weeks 1..throughWeek. Each player counted once per trade transaction. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const throughWeek = Number(req.nextUrl.searchParams.get("throughWeek") ?? 1);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    const weeks = Array.from({ length: Math.max(throughWeek, 1) }, (_, i) => i + 1);
    const txByWeek = await Promise.all(weeks.map((w) => sleeper.transactions(id, w)));
    const counts: TradeCountsResponse["counts"] = {};
    txByWeek.forEach((txs, i) => {
      const week = i + 1;
      for (const tx of txs ?? []) {
        if (tx.type !== "trade") continue;
        if (tx.status && tx.status !== "complete") continue;
        const ids = new Set<string>([...Object.keys(tx.adds ?? {}), ...Object.keys(tx.drops ?? {})]);
        for (const pid of ids) {
          if (!/^\d+$/.test(pid)) continue; // skip draft picks / non-player keys
          const e = counts[pid] ?? { count: 0, lastWeek: 0 };
          e.count += 1;
          e.lastWeek = Math.max(e.lastWeek, week);
          counts[pid] = e;
        }
      }
    });
    const body: TradeCountsResponse = { counts };
    return NextResponse.json(body, { headers: { "cache-control": "private, max-age=120" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
