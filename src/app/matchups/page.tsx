"use client";

import Link from "next/link";
import { Ready } from "@/components/fantasy";
import { EmptyState, LeagueKindChip, PageHeader, Unavailable, cx, fmtPts } from "@/components/ui";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { myTeam, opponentTeam, recordStr } from "@/lib/analysis/summary";
import { projectMatchup, type LiveCtx } from "@/lib/projections";
import type { LeagueBundle } from "@/lib/portfolio/types";
import type { PlayerMap, ProjectionMap } from "@/lib/sleeper/types";

type Bucket = "winning" | "close" | "losing" | "pending";

/** Group by projected final margin when we have one; fall back to the live score. */
function bucket(b: LeagueBundle, players: PlayerMap, proj: ProjectionMap, live: LiveCtx): Bucket {
  const m = b.matchup;
  if (!m || m.oppPoints == null) return "pending";
  const pm = projectMatchup(b, players, proj, live);
  const diff = pm?.margin ?? (m.myPoints === 0 && m.oppPoints === 0 ? null : m.myPoints - m.oppPoints);
  if (diff == null) return "pending";
  if (Math.abs(diff) < 10) return "close";
  return diff > 0 ? "winning" : "losing";
}

const TITLE: Record<Bucket, string> = { winning: "Projected win", close: "Close", losing: "Projected loss", pending: "No projection" };
const TONE: Record<Bucket, string> = { winning: "text-ok", close: "text-caution", losing: "text-urgent", pending: "text-muted" };

export default function MatchupsPage() {
  const { projections, schedule, liveStats } = usePortfolio();
  return (
    <Ready>
      {(portfolio, players) => {
        const proj = projections?.projections ?? {};
        const live: LiveCtx = { stats: liveStats, schedule };
        const hasProj = Object.keys(proj).length > 0;
        const withMatchup = portfolio.leagues.filter((b) => b.matchup);
        if (withMatchup.length === 0) return <><PageHeader title="Matchups" /><EmptyState title="No matchups this week" detail="Sleeper hasn't published matchups for your leagues yet." /></>;
        const groups = (["losing", "close", "winning", "pending"] as Bucket[]).map((k) => ({ k, list: withMatchup.filter((b) => bucket(b, players, proj, live) === k) })).filter((g) => g.list.length);
        const projRecord = withMatchup.reduce((r, b) => { const k = bucket(b, players, proj, live); if (k === "winning") r.w++; else if (k === "losing") r.l++; else if (k === "close") r.c++; return r; }, { w: 0, l: 0, c: 0 });
        return (
          <>
            <PageHeader title="Matchups" sub={<>Week {portfolio.week} · {hasProj ? <>projected {projRecord.w}-{projRecord.l}{projRecord.c ? ` with ${projRecord.c} close` : ""} · Sleeper projections scored under each league&apos;s settings; actual points replace projections as games finish</> : "Live scores from Sleeper. Projections are loading or unavailable this week."}</>} />
            <div className="grid gap-6">
              {groups.map(({ k, list }) => (
                <section key={k}>
                  <h2 className={cx("h2 mb-2", TONE[k])}>{TITLE[k]} <span className="text-muted num text-[16px]">· {list.length}</span></h2>
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {list.map((b) => {
                      const me = myTeam(b); const opp = opponentTeam(b); const m = b.matchup!;
                      const pm = projectMatchup(b, players, proj, live);
                      const isLive = (pm?.mine.remaining ?? 0) < m.myStarters.filter((id) => id && id !== "0").length || m.myPoints > 0 || (m.oppPoints ?? 0) > 0;
                      return (
                        <Link key={b.league.league_id} href={`/leagues/${b.league.league_id}`} className="card p-4 hover:border-line-2 grid gap-3">
                          <div className="flex items-center justify-between gap-2"><span className="h3 truncate">{b.league.name}</span><LeagueKindChip kind={b.format.kind} /></div>
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <div className="min-w-0"><div className="truncate font-medium">{me?.teamName ?? "Me"}</div><div className="caption">{me ? recordStr(me.record) : ""}</div><div className="num text-[28px] font-semibold">{isLive ? fmtPts(m.myPoints) : pm ? fmtPts(pm.mine.total) : "—"}</div>{isLive && pm && <div className="caption num">proj final {fmtPts(pm.mine.total)} · {pm.mine.remaining} to play</div>}{!isLive && pm && <div className="caption">projected</div>}</div>
                            <div className="text-muted text-[12px]">vs</div>
                            <div className="min-w-0 text-right"><div className="truncate font-medium">{opp?.teamName ?? "TBD"}</div><div className="caption">{opp ? recordStr(opp.record) : ""}</div><div className="num text-[28px] font-semibold">{isLive ? fmtPts(m.oppPoints) : pm?.opp ? fmtPts(pm.opp.total) : "—"}</div>{isLive && pm?.opp && <div className="caption num">proj final {fmtPts(pm.opp.total)} · {pm.opp.remaining} to play</div>}{!isLive && pm?.opp && <div className="caption">projected</div>}</div>
                          </div>
                          <div className="flex items-center justify-between caption border-t border-line pt-2">
                            <span>{pm ? `${pm.mine.remaining} to play` : ""}{pm && pm.mine.missing > 0 ? ` · ${pm.mine.missing} no proj` : ""}</span>
                            <span className={cx("num font-medium", pm?.margin == null ? "" : pm.margin > 0 ? "text-ok" : pm.margin < 0 ? "text-urgent" : "")}>{pm?.margin == null ? <Unavailable what="no projection" /> : <>{pm.margin > 0 ? "+" : ""}{fmtPts(pm.margin)} proj</>}</span>
                            <span>{pm?.opp ? `${pm.opp.remaining} to play` : ""}{pm?.opp && pm.opp.missing > 0 ? ` · ${pm.opp.missing} no proj` : ""}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <p className="caption mt-4">Once a matchup has points, the big number is the live score (same as Sleeper) and the projected final — actuals so far plus projections for who's left — sits underneath. Before kickoff the big number is the projection. Grouping uses the projected final. &quot;No proj&quot; counts starters Sleeper has no projection for (bye week, inactive, empty slot) — those contribute zero to the total.</p>
          </>
        );
      }}
    </Ready>
  );
}
