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

function Vegas({ team }: { team: string | null | undefined }) {
  const { odds } = usePortfolio();
  const l = team ? odds?.odds[team] : undefined;
  if (!odds?.configured || !l || l.implied == null) return null;
  return <span className="caption num" title="Implied team total · game total">imp {l.implied} · o/u {l.total}</span>;
}

function SwapRow({ s, players, outSlot }: { s: OptimalLineup["swaps"][number]; players: PlayerMap; outSlot: string | null }) {
  const inP = players[s.in]; const outP = s.out ? players[s.out] : undefined;
  const crossSlot = outSlot && outSlot !== s.slot;
  return (
    <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 px-4 py-2.5">
      <span className="chip chip-outline num" title={crossSlot ? `${inP?.name} goes into ${slotLabel(s.slot)}; ${outP?.name} comes out of ${slotLabel(outSlot)}. Someone shifts slots to make it legal — see the reshuffle line.` : undefined}>{crossSlot ? `${slotLabel(outSlot)}→${slotLabel(s.slot)}` : slotLabel(s.slot)}</span>
      <div className="min-w-0"><div className="caption">Start</div><PlayerCell player={inP} id={s.in} showHeadshot={false} /><Vegas team={inP?.team} /></div>
      <span className="text-muted">→</span>
      <div className="min-w-0"><div className="caption">Sit</div>{outP ? <><PlayerCell player={outP} id={s.out!} showHeadshot={false} /><Vegas team={outP.team} /></> : <span className="text-urgent">Empty slot</span>}</div>
      <div className="text-right"><div className="num text-ok font-semibold text-[16px]">+{fmtPts(s.gain)}</div><div className="caption max-w-[14ch] truncate" title={s.reason}>{s.reason}</div></div>
    </div>
  );
}

/** Full before/after lineup so a multi-slot chain is unambiguous. */
function ResultingLineup({ lineup, current, players }: { lineup: OptimalLineup; current: string[]; players: PlayerMap }) {
  return (
    <table className="tbl text-[13px]">
      <thead><tr><th>Slot</th><th>Now</th><th></th><th>Recommended</th><th className="r">Proj</th></tr></thead>
      <tbody>
        {lineup.slots.map((a, i) => {
          const cur = current[i] && current[i] !== "0" ? current[i] : null;
          const changed = cur !== a.playerId;
          return (
            <tr key={i} className={changed ? "bg-ok/5" : ""}>
              <td><span className="chip chip-outline num">{slotLabel(a.slot)}</span></td>
              <td className={changed ? "text-muted line-through decoration-line-2" : ""}>{cur ? players[cur]?.name : <span className="text-urgent">Empty</span>}</td>
              <td className="text-muted">{changed ? "→" : ""}</td>
              <td className={changed ? "font-medium" : "text-muted"}>{a.playerId ? players[a.playerId]?.name : <span className="text-urgent">Empty</span>}</td>
              <td className="r num">{fmtPts(a.proj)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
  const { projections, trending, schedule, odds } = usePortfolio();
  const [view, setView] = useState<View>("actionable");
  return (
    <Ready>
      {(portfolio, players) => {
        const proj = projections?.projections ?? {};
        if (Object.keys(proj).length === 0) return <><PageHeader title="Moves" /><EmptyState title="Projections not loaded yet" detail="Start/sit and waiver suggestions need this week's projections. Hit refresh in a moment." /></>;
        const moves = allMoves(portfolio, players, proj, trending?.adds ?? [], schedule);
        const anyLocked = moves.some((m) => m.locked.size > 0);
        const totalGain = moves.reduce((n, m) => n + (m.lineup?.gain ?? 0), 0);
        const swaps = moves.reduce((n, m) => n + (m.lineup?.swaps.length ?? 0), 0);
        const pickups = moves.reduce((n, m) => n + m.pickups.length, 0);
        const list = view === "actionable" ? moves.filter((m) => (m.lineup?.swaps.length ?? 0) > 0 || m.pickups.length > 0) : moves;
        return (
          <>
            <PageHeader title="Moves" sub={<>Week {portfolio.week} · start/sit and waiver moves that raise your projected total, using Sleeper&apos;s projections under each league&apos;s scoring. Suggestions, not orders — check injury news and matchups before you pull the trigger.{anyLocked && <> <span className="text-gold">Games are underway:</span> players whose game has kicked off are locked in place and never suggested.</>}</>}
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
                      {lineup.swaps.map((s) => {
                        const outIdx = s.out ? (b.myRoster?.starters ?? []).indexOf(s.out) : -1;
                        return <SwapRow key={s.in} s={s} players={players} outSlot={outIdx >= 0 ? lineup.slots[outIdx]?.slot ?? null : null} />;
                      })}
                      {lineup.reshuffles.length > 0 && (
                        <div className="px-4 py-2 text-[12.5px] text-muted flex flex-wrap gap-x-3 gap-y-1">
                          <span className="caption">To make it legal, also move:</span>
                          {lineup.reshuffles.map((r) => <span key={r.playerId}><span className="text-fg">{players[r.playerId]?.name}</span> {slotLabel(r.from)} → {slotLabel(r.to)}</span>)}
                        </div>
                      )}
                      <details className="px-4 py-2">
                        <summary className="caption cursor-pointer hover:text-gold">Show resulting lineup</summary>
                        <div className="mt-2 overflow-x-auto"><ResultingLineup lineup={lineup} current={b.myRoster?.starters ?? []} players={players} /></div>
                      </details>
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
            <p className="caption mt-4">Gain = change in the league&apos;s best possible projected lineup. Drop suggestions are the bench player who adds least to that lineup this week; for dynasty leagues that is not the same as least valuable.{odds?.configured ? " Vegas numbers are the team's implied total and the game over/under — a tiebreaker for close calls, not a projection." : " Add an ODDS_API_KEY (the-odds-api.com, free tier) to see Vegas implied totals next to close calls."}</p>
          </>
        );
      }}
    </Ready>
  );
}
