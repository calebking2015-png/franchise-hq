import { NextRequest, NextResponse } from "next/server";
import { buildPortfolio } from "@/lib/portfolio/build";
import { SleeperError } from "@/lib/sleeper/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")?.trim();
  if (!username) return NextResponse.json({ error: "username is required" }, { status: 400 });
  try {
    const portfolio = await buildPortfolio(username);
    return NextResponse.json(portfolio, {
      headers: { "cache-control": "private, max-age=60" },
    });
  } catch (e) {
    const status = e instanceof SleeperError ? 502 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
