"use client";

import Link from "next/link";
import { Ready } from "@/components/fantasy";
import { EmptyState, LeagueKindChip, PageHeader, Unavailable, cx, fmtPts } from "@/components/ui";
import { myTeam, opponentTeam, recordStr } from "@/lib/analysis/summary";
import type { LeagueBundle } from "@/lib/portfolio/types";

type Bucket = "winning" | "close" | "losing" | "pending";

function bucket(b: LeagueBundle): Bucket {
  const m = b.matchup;
  if (!m || m.oppPoints == null || (m.myPoints === 0 && m.oppPoints === 0)) return "pending";
  const diff = m.myPoints - m.oppPoints;
  if (Math.abs(diff) < 10) return "close";
  return diff > 0 ? "winning" : "losing";
}

const TITLE: Record<Bucket, string> = { winning: "Ahead", close: "Close", losing: "Behind", pending: "Not started" };
const TONE: Record<Bucket, string> = { winning: "text-ok", close: "text-caution", losing: "text-urgent", pending: "text-muted" };

export default function MatchupsPage() {
  return (
    <Ready>
      {(portfolio, players) => {
        const withMatchup = portfolio.leagues.filter((b) => b.matchup);
        if (withMatchup.length === 0) return <><PageHeader title="Matchups" /><EmptyState title="No matchups this week" detail="Sleeper hasn't published matchups for your leagues yet." /></>;
        const groups = (["losing", "close", "winning", "pending"] as Bucket[]).map((k) => ({ k, list: withMatchup.filter((b) => bucket(b) === k) })).filter((g) => g.list.length);
        return (
          <>
            <PageHeader title="Matchups" sub={<>Week {portfolio.week} · live scores from Sleeper. Projected margin and win probability appear once a projection provider is configured; until then matchups are grouped by the live score (within 10 points = close).</>} />
            <div className="grid gap-6">
              {groups.map(({ k, list }) => (
                <section key={k}>
                  <h2 className={cx("h2 mb-2", TONE[k])}>{TITLE[k]} <span className="text-muted num text-[16px]">· {list.length}</span></h2>
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {list.map((b) => {
                      const me = myTeam(b); const opp = opponentTeam(b); const m = b.matchup!;
                      const remaining = (starters: string[], pts: number[]) => starters.filter((id, i) => id !== "0" && !(pts[i] > 0) && players[id]?.team).length;
                      return (
                        <Link key={b.league.league_id} href={`/leagues/${b.league.league_id}`} className="card p-4 hover:border-line-2 grid gap-3">
                          <div className="flex items-center justify-between gap-2"><span className="h3 truncate">{b.league.name}</span><LeagueKindChip kind={b.format.kind} /></div>
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <div className="min-w-0"><div className="truncate font-medium">{me?.teamName ?? "Me"}</div><div className="caption">{me ? recordStr(me.record) : ""}</div><div className="num text-[28px] font-semibold">{fmtPts(m.myPoints)}</div></div>
                            <div className="text-muted text-[12px]">vs</div>
                            <div className="min-w-0 text-right"><div className="truncate font-medium">{opp?.teamName ?? "TBD"}</div><div className="caption">{opp ? recordStr(opp.record) : ""}</div><div className="num text-[28px] font-semibold">{fmtPts(m.oppPoints)}</div></div>
                          </div>
                          <div className="flex items-center justify-between caption border-t border-line pt-2">
                            <span>{remaining(m.myStarters, m.myStarterPoints)} yet to score</span>
                            <span>Proj: <Unavailable what="n/a" /></span>
                            <span>{remaining(m.oppStarters, m.oppStarterPoints)} yet to score</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <p className="caption mt-4">"Yet to score" counts starters with zero points so far; without kickoff data it can't distinguish a player who hasn't played from one who was shut out.</p>
          </>
        );
      }}
    </Ready>
  );
}
