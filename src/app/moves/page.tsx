"use client";

import Link from "next/link";
import { useState } from "react";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, LeagueKindChip, PageHeader, PlayerCell, Segmented, StatTile, cx, fmtPts } from "@/components/ui";
import { allMoves, type OptimalLineup, type Pickup } from "@/lib/analysis/optimizer";
import { slotLabel } from "@/lib/league/format";
import type { LeagueBundle } from "@/lib/portfolio/types";
import type { PlayerMap } from "@/lib/sleeper/types";

type View = "all" | "actionable";

function SwapRow({ s, players }: { s: OptimalLineup["swaps"][number]; players: PlayerMap }) {
  const inP = players[s.in]; const outP = s.out ? players[s.out] : undefined;
  return (
    <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 px-4 py-2.5">
      <span className="chip chip-outline num">{slotLabel(s.slot)}</span>
      <div className="min-w-0"><div className="caption">Start</div><PlayerCell player={inP} id={s.in} showHeadshot={false} /></div>
      <span className="text-muted">→</span>
      <div className="min-w-0"><div className="caption">Sit</div>{outP ? <PlayerCell player={outP} id={s.out!} showHeadshot={false} /> : <span className="text-urgent">Empty slot</span>}</div>
      <div className="text-right"><div className="num text-ok font-semibold text-[16px]">+{fmtPts(s.gain)}</div><div className="caption max-w-[14ch] truncate" title={s.reason}>{s.reason}</div></div>
    </div>
  );
}

function PickupRow({ w, players, b }: { w: Pickup; players: PlayerMap; b: LeagueBundle }) {
  const add = players[w.add]; const drop = w.drop ? players[w.drop] : undefined;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 px-4 py-2.5">
      <div className="min-w-0"><div className="caption">Add · proj {fmtPts(w.addProj)}{w.trendingAdds ? ` · +${w.trendingAdds.toLocaleString()} adds` : ""}</div><PlayerCell player={add} id={w.add} showHeadshot={false} /></div>
      <span className="text-muted">for</span>
      <div className="min-w-0"><div className="caption">Drop · proj {fmtPts(w.dropProj)}</div>{drop ? <PlayerCell player={drop} id={w.drop!} showHeadshot={false} /> : <span className="text-muted">open spot</span>}</div>
      <div className="text-right"><div className="num text-ok font-semibold text-[16px]">+{fmtPts(w.lineupGain)}</div><div className="caption">{b.format.waiver === "FAAB" ? "FAAB bid" : "waiver claim"}</div></div>
    </div>
  );
}

export default function MovesPage() {
  const { projections, trending } = usePortfolio();
  const [view, setView] = useState<View>("actionable");
  return (
    <Ready>
      {(portfolio, players) => {
        const proj = projections?.projections ?? {};
        if (Object.keys(proj).length === 0) return <><PageHeader title="Moves" /><EmptyState title="Projections not loaded yet" detail="Start/sit and waiver suggestions need this week's projections. Hit refresh in a moment." /></>;
        const moves = allMoves(portfolio, players, proj, trending?.adds ?? []);
        const totalGain = moves.reduce((n, m) => n + (m.lineup?.gain ?? 0), 0);
        const swaps = moves.reduce((n, m) => n + (m.lineup?.swaps.length ?? 0), 0);
        const pickups = moves.reduce((n, m) => n + m.pickups.length, 0);
        const list = view === "actionable" ? moves.filter((m) => (m.lineup?.swaps.length ?? 0) > 0 || m.pickups.length > 0) : moves;
        return (
          <>
            <PageHeader title="Moves" sub={<>Week {portfolio.week} · start/sit and waiver moves that raise your projected total, using Sleeper&apos;s projections under each league&apos;s scoring. Suggestions, not orders — check injury news and matchups before you pull the trigger.</>}
              actions={<Segmented value={view} onChange={setView} options={[{ value: "actionable", label: "Has moves", count: list.length }, { value: "all", label: "All leagues", count: moves.length }]} />} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatTile label="Points on the table" value={`+${fmtPts(totalGain)}`} sub="Across all lineups this week" tone={totalGain >= 5 ? "urgent" : totalGain > 0 ? "gold" : "ok"} />
              <StatTile label="Start/sit swaps" value={swaps} sub={swaps ? "Bench beats a starter" : "Every lineup is optimal"} tone={swaps ? undefined : "ok"} />
              <StatTile label="Waiver pickups" value={pickups} sub="Free agents that raise your lineup" tone="muted" />
              <StatTile label="Leagues clean" value={moves.filter((m) => !(m.lineup?.swaps.length) && !m.pickups.length).length} sub="No projected improvements" tone="ok" />
            </div>
            {list.length === 0 && <EmptyState title="Every lineup is already optimal" detail="No bench player out-projects a starter, and no free agent would raise your projected total." />}
            <div className="grid gap-4">
              {list.map(({ b, lineup, pickups }) => (
                <Card key={b.league.league_id} pad={false}
                  title={<Link href={`/leagues/${b.league.league_id}`} className="hover:text-gold flex items-center gap-2">{b.league.name}<LeagueKindChip kind={b.format.kind} /></Link>}
                  actions={lineup && <span className={cx("num text-[13.5px]", lineup.gain > 0 ? "text-ok" : "text-muted")}>{fmtPts(lineup.currentTotal)} → {fmtPts(lineup.total)}{lineup.gain > 0 ? ` (+${fmtPts(lineup.gain)})` : " · optimal"}</span>}>
                  {lineup && lineup.swaps.length > 0 && (
                    <div className="divide-y divide-line">
                      <div className="px-4 py-2 caption bg-surface-2">Start / sit</div>
                      {lineup.swaps.map((s) => <SwapRow key={s.in} s={s} players={players} />)}
                    </div>
                  )}
                  {pickups.length > 0 && (
                    <div className="divide-y divide-line border-t border-line">
                      <div className="px-4 py-2 caption bg-surface-2">Waiver pickups{b.format.isDynasty ? " · dynasty: weekly projection only, weigh long-term value yourself" : ""}</div>
                      {pickups.slice(0, 5).map((w) => <PickupRow key={w.add} w={w} players={players} b={b} />)}
                    </div>
                  )}
                  {lineup && lineup.swaps.length === 0 && pickups.length === 0 && <div className="p-4 caption">Lineup is optimal and no free agent improves it.</div>}
                </Card>
              ))}
            </div>
            <p className="caption mt-4">Gain = change in the league&apos;s best possible projected lineup. Drop suggestions are the bench player who adds least to that lineup this week; for dynasty leagues that is not the same as least valuable.</p>
          </>
        );
      }}
    </Ready>
  );
}
