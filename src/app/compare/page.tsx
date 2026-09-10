"use client";

import Link from "next/link";
import { useState } from "react";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, PageHeader, PlayerCell, Segmented, StatTile, cx, fmtPts } from "@/components/ui";
import { scoreStatLine } from "@/lib/scoring/engine";
import type { LeagueBundle } from "@/lib/portfolio/types";
import type { PlayerMap } from "@/lib/sleeper/types";

type Scope = "starters" | "rostered" | "all";

interface Row { playerId: string; sleeper: number | null; gb: number | null; diff: number; tdPct?: number; leagues: { b: LeagueBundle; starting: boolean }[] }

export default function ComparePage() {
  const { sleeperProjections, goldenBoy, projSource, setProjSource } = usePortfolio();
  const [scope, setScope] = useState<Scope>("starters");
  return (
    <Ready>
      {(portfolio, players) => {
        const sp = sleeperProjections?.projections ?? {};
        const gb = goldenBoy?.projections ?? {};
        if (!goldenBoy) return <><PageHeader title="Compare projections" /><EmptyState title="Loading Golden Boy feed…" /></>;
        if (goldenBoy.error || !goldenBoy.count) return <><PageHeader title="Compare projections" /><EmptyState title="Golden Boy feed unavailable" detail={goldenBoy.error ?? "No rows matched."} /></>;

        // Score both sources under a reference league so the numbers are comparable on one page:
        // the league where the player is rostered (first one), else the first league.
        const scoreIn = (b: LeagueBundle, stats: Record<string, number> | undefined, pos: string) => {
          if (!stats) return null;
          const sc = b.league.scoring_settings ?? {};
          if (typeof stats.gb_qb_pts === "number") return stats.gb_qb_pts + ((sc.pass_td ?? 4) - 4) * (stats.pass_td ?? 0);
          return scoreStatLine(stats, sc, pos).points;
        };
        const where = (pid: string) => portfolio.leagues.map((b) => ({ b, starting: (b.myRoster?.starters ?? []).includes(pid), mine: (b.myRoster?.players ?? []).includes(pid) })).filter((x) => x.mine);
        const ids = new Set<string>([...Object.keys(gb), ...(scope === "all" ? Object.keys(sp) : [])]);
        const rows: Row[] = [];
        for (const pid of ids) {
          const p = players[pid]; if (!p || !["QB", "RB", "WR", "TE"].includes(p.pos)) continue;
          const w = where(pid);
          if (scope === "starters" && !w.some((x) => x.starting)) continue;
          if (scope === "rostered" && !w.length) continue;
          const ref = w[0]?.b ?? portfolio.leagues[0];
          const s = scoreIn(ref, sp[pid]?.stats, p.pos); const g = scoreIn(ref, gb[pid]?.stats, p.pos);
          if (s == null && g == null) continue;
          rows.push({ playerId: pid, sleeper: s, gb: g, diff: (g ?? 0) - (s ?? 0), tdPct: gb[pid]?.tdPct, leagues: w.map(({ b, starting }) => ({ b, starting })) });
        }
        rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        const both = rows.filter((r) => r.sleeper != null && r.gb != null);
        const bigger = both.filter((r) => r.diff >= 3).length, smaller = both.filter((r) => r.diff <= -3).length;
        const mad = both.length ? both.reduce((n, r) => n + Math.abs(r.diff), 0) / both.length : 0;
        return (
          <>
            <PageHeader title="Compare projections" sub={<>Sleeper (Rotowire) vs <a href={goldenBoy.url} target="_blank" rel="noreferrer" className="text-gold hover:underline">Fantasy Golden Boy</a>, both scored under the league where you roster each player. Sorted by disagreement — the top of this list is where a second opinion actually changes a decision.</>}
              actions={<div className="flex flex-wrap gap-2 items-center">
                <Segmented value={scope} onChange={setScope} options={[{ value: "starters", label: "My starters" }, { value: "rostered", label: "My rosters" }, { value: "all", label: "Everyone" }]} />
                <Segmented value={projSource} onChange={setProjSource} options={[{ value: "sleeper", label: "Use Sleeper" }, { value: "goldenboy", label: "Use Golden Boy" }, { value: "blend", label: "Blend" }]} />
              </div>} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatTile label="Players compared" value={both.length} sub={`${goldenBoy.count} in Golden Boy feed`} tone="muted" />
              <StatTile label="Golden Boy higher" value={bigger} sub="by 3+ points" tone="ok" />
              <StatTile label="Sleeper higher" value={smaller} sub="by 3+ points" tone="urgent" />
              <StatTile label="Avg. gap" value={fmtPts(mad)} sub="mean absolute difference" tone="gold" />
            </div>
            <Card pad={false}>
              <table className="tbl">
                <thead><tr><th>Player</th><th className="hidden md:table-cell">Where</th><th className="r">Sleeper</th><th className="r">Golden Boy</th><th className="r">Diff</th><th className="r hidden sm:table-cell" title="Golden Boy anytime-TD probability">TD%</th></tr></thead>
                <tbody>
                  {rows.slice(0, 150).map((r) => (
                    <tr key={r.playerId}>
                      <td><PlayerCell player={players[r.playerId]} id={r.playerId} showHeadshot={false} /></td>
                      <td className="hidden md:table-cell"><div className="flex flex-wrap gap-1">{r.leagues.map(({ b, starting }) => <Link key={b.league.league_id} href={`/leagues/${b.league.league_id}`} className={cx("chip text-[11px]", starting ? "bg-ok/12 text-ok" : "chip-outline text-muted")}>{b.league.name}</Link>)}</div></td>
                      <td className="r num">{r.sleeper != null ? fmtPts(r.sleeper) : <span className="text-faint">—</span>}</td>
                      <td className="r num">{r.gb != null ? fmtPts(r.gb) : <span className="text-faint">—</span>}</td>
                      <td className={cx("r num font-semibold", r.sleeper == null || r.gb == null ? "text-faint" : r.diff >= 3 ? "text-ok" : r.diff <= -3 ? "text-urgent" : "text-muted")}>{r.sleeper != null && r.gb != null ? `${r.diff > 0 ? "+" : ""}${fmtPts(r.diff)}` : "—"}</td>
                      <td className="r num hidden sm:table-cell text-muted">{r.tdPct != null ? `${Math.round(r.tdPct * 100)}%` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <p className="caption mt-4">Projections courtesy of <a href={goldenBoy.url} target="_blank" rel="noreferrer" className="text-gold hover:underline">Fantasy Golden Boy</a>, used with permission. RB/WR/TE are rebuilt from his stat lines and scored under each league&apos;s settings, so they&apos;re exact in every format; QBs use his headline number (adjusted for 6-pt pass-TD leagues); K and DEF come from Sleeper. TD% is his anytime-touchdown probability.</p>
          </>
        );
      }}
    </Ready>
  );
}
