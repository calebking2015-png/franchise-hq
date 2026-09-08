import { NextResponse } from "next/server";
import { fetchOdds } from "@/lib/odds";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await fetchOdds();
    return NextResponse.json({ ...r, fetchedAt: new Date().toISOString() }, { headers: { "cache-control": "public, max-age=3600, s-maxage=21600" } });
  } catch (e) {
    return NextResponse.json({ configured: true, odds: {}, note: (e as Error).message }, { status: 200 });
  }
}
