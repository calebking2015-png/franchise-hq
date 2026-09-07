import { NextRequest, NextResponse } from "next/server";
import { sleeper } from "@/lib/sleeper/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const hours = Number(req.nextUrl.searchParams.get("hours") ?? 24);
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 100);
  try {
    const [adds, drops] = await Promise.all([sleeper.trendingAdds(hours, limit), sleeper.trendingDrops(hours, limit)]);
    return NextResponse.json(
      { adds: adds ?? [], drops: drops ?? [], hours, fetchedAt: new Date().toISOString() },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
