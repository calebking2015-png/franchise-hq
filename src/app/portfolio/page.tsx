"use client";

import Link from "next/link";
import { useState } from "react";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, PageHeader, PlayerCell, PositionBadge, SearchInput, Segmented, TeamLogo, PlayerLink, cx } from "@/components/ui";
import { allExposure, teamExposure, positionExposure, injuredExposure, exposureWarnings } from "@/lib/analysis/exposure";

type Pos = "ALL" | "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
type Tab = "players" | "teams" | "risk";

export default function PortfolioPage() {
  const [pos, setPos] = useState<Pos>("ALL");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("players");
  const [minShares, setMinShares] = useState(1);

  return (
    <Ready>
      {(portfolio, players) => {
        const exposure = allExposure(portfolio, players);
        const teams = teamExposure(exposure, players);
        const byPos = positionExposure(exposure, players);
        const injured = injuredExposure(exposure, players);
        const warnings = exposureWarnings(exposure, teams, players, portfolio.leagues.length);
        const list = exposure.filter((e) => {
          const p = players[e.playerId];
          if (!p) return false;
          if (pos !== "ALL" && p.pos !== pos) return false;
          if (e.shares < minShares) return false;
          if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
          return true;
        });
        const totalShares = exposure.reduce((n, e) => n + e.shares, 0);

        return (
          <>
            <PageHeader title="Portfolio" sub={`${exposure.length} unique players · ${totalShares} roster shares across ${portfolio.leagues.length} leagues`} />

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
              {["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => (
                <button key={p} type="button" onClick={() => { setPos(pos === p ? "ALL" : (p as Pos)); setTab("players"); }} className={cx("card-2 px-3 py-2.5 text-left hover:border-line-2", pos === p && "border-gold")}>
                  <PositionBadge pos={p} />
                  <div className="num text-[22px] font-semibold mt-1">{byPos[p]?.shares ?? 0}<span className="text-muted text-[13px]"> shares</span></div>
                  <div className="caption">{byPos[p]?.unique ?? 0} unique</div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Segmented value={tab} onChange={setTab} options={[{ value: "players", label: "Player exposure" }, { value: "teams", label: "NFL team exposure" }, { value: "risk", label: "Risk", count: warnings.length + injured.length }]} />
              {tab === "players" && <>
                <Segmented value={String(minShares) as "1" | "2" | "3"} onChange={(v) => setMinShares(Number(v))} options={[{ value: "1", label: "All" }, { value: "2", label: "2+ shares" }, { value: "3", label: "3+ shares" }]} />
                <SearchInput value={q} onChange={setQ} className="w-full sm:w-56" />
              </>}
            </div>

            {tab === "players" && (list.length === 0 ? <EmptyState title="No players match" /> : (
              <Card pad={false}><div className="overflow-x-auto"><table className="data">
                <thead><tr><th>Player</th><th className="r">Shares</th><th className="r">Exposure</th><th className="hidden md:table-cell">Leagues</th></tr></thead>
                <tbody>{list.map((e) => (
                  <tr key={e.playerId}>
                    <td><PlayerCell player={players[e.playerId]} id={e.playerId} /></td>
                    <td className="r num text-[16px] font-semibold">{e.shares}<span className="text-muted text-[13px]">/{e.total}</span></td>
                    <td className="r"><div className="inline-flex items-center gap-2"><span className="num w-10 text-right">{e.pct}%</span><span className="h-1.5 w-20 rounded bg-surface-3 overflow-hidden hidden sm:inline-block"><span className={cx("block h-full", e.pct >= 50 ? "bg-gold" : "bg-info")} style={{ width: `${e.pct}%` }} /></span></div></td>
                    <td className="hidden md:table-cell"><div className="flex flex-wrap gap-1">{e.leagues.filter((l) => l.state === "mine").map((l) => <Link key={l.leagueId} href={`/leagues/${l.leagueId}`} className={cx("chip chip-outline hover:border-gold", l.starting ? "text-ink" : "text-muted")}>{l.leagueName}{l.starting ? "" : " (bench)"}</Link>)}</div></td>
                  </tr>
                ))}</tbody>
              </table></div></Card>
            ))}

            {tab === "teams" && (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {teams.map((t) => (
                  <Card key={t.team} pad={false} title={<span className="flex items-center gap-2"><TeamLogo team={t.team} size={22} />{t.team}</span>} actions={<span className="num text-[18px] font-semibold">{t.shares}<span className="caption font-normal"> shares</span></span>}>
                    <div className="px-4 py-2 grid gap-1 text-[13.5px]">
                      {t.players.sort((a, b) => b.shares - a.shares).map((x) => { const p = players[x.playerId]; return <div key={x.playerId} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 min-w-0"><PositionBadge pos={p.pos} /><PlayerLink player={p} className="truncate" /></span><span className="num text-muted">{x.shares}</span></div>; })}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {tab === "risk" && (
              <div className="grid lg:grid-cols-2 gap-4">
                <Card title="Concentration warnings" pad={false}>
                  {warnings.length === 0 ? <div className="p-4 caption">No player or team makes up a risky share of your portfolio.</div> : (
                    <div className="divide-y divide-line">{warnings.map((w, i) => <div key={i} className="px-4 py-2.5 border-l-[3px] border-warn"><div className="font-medium">{w.playerId ? <PlayerLink id={w.playerId}>{w.title}</PlayerLink> : w.title}</div><div className="caption">{w.detail}</div></div>)}</div>
                  )}
                </Card>
                <Card title="Injury concentration" pad={false} actions={<span className="caption">{injured.reduce((n, e) => n + e.shares, 0)} shares flagged</span>}>
                  {injured.length === 0 ? <div className="p-4 caption">No injured or inactive players on your rosters.</div> : (
                    <div className="divide-y divide-line">{injured.map((e) => <div key={e.playerId} className="flex items-center justify-between px-4 py-2"><PlayerCell player={players[e.playerId]} showHeadshot={false} /><span className="num text-[15px]">{e.shares}<span className="text-muted text-[12px]"> shares</span></span></div>)}</div>
                  )}
                </Card>
                <Card title="Bye-week concentration"><p className="caption">Needs a schedule provider — Sleeper's public API doesn't publish NFL bye weeks. Configure one and this fills in automatically.</p></Card>
                <Card title="Stack exposure"><p className="caption">Same-team QB/pass-catcher stacks per league are counted once game-level data is wired in; today only NFL team share counts are shown.</p></Card>
              </div>
            )}
          </>
        );
      }}
    </Ready>
  );
}
