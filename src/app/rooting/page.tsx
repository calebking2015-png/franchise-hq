"use client";

import Link from "next/link";
import { useState } from "react";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, PageHeader, PlayerCell, Segmented, StatusBadge, TeamLogo, cx, fmtPts } from "@/components/ui";
import { rootingInterests, teamRooting, type RootingInterest, type Side } from "@/lib/analysis/rooting";
import type { PlayerMap } from "@/lib/sleeper/types";

const LABEL: Record<Side, string> = { for: "Root for", against: "Root against", neutral: "Neutral" };
const TONE: Record<Side, string> = { for: "text-ok", against: "text-urgent", neutral: "text-muted" };
const BLURB: Record<Side, string> = {
  for: "Players starting for you this week. Stake = projected points they add to your lineups, minus anywhere they start against you.",
  against: "Players starting against you. Stake = projected points they're expected to put up against your teams.",
  neutral: "Starting on both sides of your week with the stakes roughly cancelling out. You win either way — or lose either way.",
};

function StakeBar({ r, max }: { r: RootingInterest; max: number }) {
  const pct = max ? Math.min(100, (Math.abs(r.stake) / max) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden" aria-hidden>
      <div className={cx("h-full rounded-full", r.side === "for" ? "bg-ok" : r.side === "against" ? "bg-urgent" : "bg-line-2")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Row({ r, players, max }: { r: RootingInterest; players: PlayerMap; max: number }) {
  const p = players[r.playerId];
  if (!p) return null;
  const forL = r.leagues.filter((l) => l.side === "for");
  const agL = r.leagues.filter((l) => l.side === "against");
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 py-3 px-4">
      <div className="min-w-0 flex items-center gap-2">
        <PlayerCell player={p} id={r.playerId} sub={<>{r.opp ? <>{p.team} {r.opp.startsWith("@") ? r.opp : `vs ${r.opp}`}</> : p.team ?? "FA"}</>} />
        <StatusBadge player={p} />
      </div>
      <div className="text-right">
        <div className={cx("num text-[20px] font-semibold leading-none", TONE[r.side])}>{r.stake > 0 ? "+" : ""}{fmtPts(r.stake)}</div>
        <div className="caption num">{r.forCount ? `${r.forCount} for` : ""}{r.forCount && r.againstCount ? " · " : ""}{r.againstCount ? `${r.againstCount} against` : ""}</div>
      </div>
      <div className="col-span-2"><StakeBar r={r} max={max} /></div>
      <div className="col-span-2 flex flex-wrap gap-1 text-[12px]">
        {forL.map((l) => <Link key={l.leagueId + "f"} href={`/leagues/${l.leagueId}`} className="chip bg-ok/12 text-ok hover:bg-ok/20">{l.leagueName}{l.proj != null && <span className="num ml-1 opacity-80">{fmtPts(l.proj)}</span>}</Link>)}
        {agL.map((l) => <Link key={l.leagueId + "a"} href={`/leagues/${l.leagueId}`} className="chip bg-urgent/12 text-urgent hover:bg-urgent/20">{l.leagueName} · {l.team}{l.proj != null && <span className="num ml-1 opacity-80">{fmtPts(l.proj)}</span>}</Link>)}
      </div>
    </div>
  );
}

export default function RootingPage() {
  const { projections } = usePortfolio();
  const [side, setSide] = useState<Side>("for");
  return (
    <Ready>
      {(portfolio, players) => {
        const proj = projections?.projections ?? {};
        const all = rootingInterests(portfolio, players, proj);
        const list = all.filter((r) => r.side === side);
        const teams = teamRooting(all, players);
        const teamList = side === "neutral" ? teams.filter((t) => Math.abs(t.stake) < 3) : teams.filter((t) => (side === "for" ? t.stake > 0 : t.stake < 0)).slice(0, 8);
        const max = Math.max(...all.map((r) => Math.abs(r.stake)), 1);
        const counts = { for: all.filter((r) => r.side === "for").length, against: all.filter((r) => r.side === "against").length, neutral: all.filter((r) => r.side === "neutral").length };
        const hasProj = Object.keys(proj).length > 0;
        if (all.length === 0) return <><PageHeader title="Rooting interests" /><EmptyState title="No matchups yet" detail="Sleeper hasn't published this week's matchups, so there's nobody to root for or against." /></>;
        return (
          <>
            <PageHeader title="Rooting interests" sub={<>Week {portfolio.week} · {all.length} players starting for or against you across {portfolio.leagues.filter((b) => b.matchup).length} matchups. {hasProj ? `Stakes weighted by Sleeper projections under each league's scoring.` : "Projections unavailable — stakes shown as starter counts."}</>}
              actions={<Segmented value={side} onChange={setSide} options={[{ value: "for", label: "Root for", count: counts.for }, { value: "against", label: "Root against", count: counts.against }, { value: "neutral", label: "Neutral", count: counts.neutral }]} />} />
            <p className="caption mb-4">{BLURB[side]}</p>

            {teamList.length > 0 && (
              <section className="mb-5">
                <h2 className="h2 mb-2">NFL teams</h2>
                <div className="flex flex-wrap gap-2">
                  {teamList.map((t) => (
                    <div key={t.team} className="card-2 px-3 py-2 flex items-center gap-2.5">
                      <TeamLogo team={t.team} size={22} />
                      <div>
                        <div className="text-[13.5px] font-medium leading-tight">{t.team}{t.opp && <span className="text-muted font-normal"> {t.opp.startsWith("@") ? t.opp : `vs ${t.opp}`}</span>}</div>
                        <div className="caption num">{t.players.length} player{t.players.length === 1 ? "" : "s"} · {t.forCount} for / {t.againstCount} against</div>
                      </div>
                      <div className={cx("num text-[17px] font-semibold ml-1", TONE[side])}>{t.stake > 0 ? "+" : ""}{fmtPts(t.stake)}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <Card pad={false} title={<span className={TONE[side]}>{LABEL[side]}</span>} actions={<span className="caption">sorted by stake</span>}>
              {list.length === 0 ? <div className="p-4 caption">Nobody in this bucket this week.</div> : (
                <div className="divide-y divide-line">{list.map((r) => <Row key={r.playerId} r={r} players={players} max={max} />)}</div>
              )}
            </Card>
            <p className="caption mt-4">Stake is calculated from your Sleeper lineups and opponents' lineups only. A player you start in two leagues and face in one shows as "2 for · 1 against" with the net projected points.</p>
          </>
        );
      }}
    </Ready>
  );
}
