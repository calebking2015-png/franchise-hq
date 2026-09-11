"use client";

import Link from "next/link";
import { useState } from "react";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, PageHeader, PlayerCell, PositionBadge, Segmented, StatTile, cx, fmtPts } from "@/components/ui";
import { positionalDepth } from "@/lib/analysis/exposure";
import { buildTrends, type Trend, type Verdict } from "@/lib/analysis/trends";
import type { PlayerMap } from "@/lib/sleeper/types";

const LABEL: Record<Verdict, string> = { "buy-low": "Buy low", "sell-high": "Sell high", hold: "Hold" };
const TONE: Record<Verdict, string> = { "buy-low": "text-ok", "sell-high": "text-urgent", hold: "text-muted" };
const BG: Record<Verdict, string> = { "buy-low": "bg-ok/12 text-ok", "sell-high": "bg-urgent/12 text-urgent", hold: "chip-outline text-muted" };

function ConfDot({ c }: { c: Trend["confidence"] }) {
  const n = c === "high" ? 3 : c === "medium" ? 2 : 1;
  return <span className="inline-flex gap-0.5 items-center" title={`${c} confidence — based on ${c === "low" ? "1–2" : c === "medium" ? "3–4" : "5+"} games`}>{[0, 1, 2].map((i) => <span key={i} className={cx("w-1.5 h-1.5 rounded-full", i < n ? "bg-gold" : "bg-line-2")} />)}</span>;
}

function TrendRow({ t, players }: { t: Trend; players: PlayerMap }) {
  const p = players[t.playerId];
  if (!p) return null;
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <PlayerCell player={p} id={t.playerId} showHeadshot={false} />
        <span className={cx("chip shrink-0", BG[t.verdict])}>{LABEL[t.verdict]}</span>
      </div>
      <div className="flex items-center gap-x-4 gap-y-1 mt-2 flex-wrap text-[12.5px]">
        <span className="caption">Pts/gm <span className="num text-ink">{fmtPts(t.ppg)}</span></span>
        <span className="caption">vs proj <span className={cx("num", t.ptsOverExpected > 0 ? "text-ok" : t.ptsOverExpected < 0 ? "text-urgent" : "text-ink")}>{t.ptsOverExpected > 0 ? "+" : ""}{fmtPts(t.ptsOverExpected)}</span></span>
        {t.opportunity > 0 && <span className="caption">Opp/gm <span className="num text-ink">{t.opportunity.toFixed(0)}</span></span>}
        {t.tdPct != null && <span className="caption">TD% <span className="num text-ink">{Math.round(t.tdPct * 100)}%</span></span>}
        <span className="ml-auto flex items-center gap-1.5"><ConfDot c={t.confidence} /><span className="caption">{t.games} gm</span></span>
      </div>
      <p className="caption mt-1.5">{t.reason}</p>
      {t.mine.length > 1 && <div className="flex flex-wrap gap-1 mt-1.5">{t.mine.map((m) => <Link key={m.leagueId} href={`/leagues/${m.leagueId}`} className="chip chip-outline text-[11px] text-muted">{m.leagueName}</Link>)}</div>}
    </div>
  );
}

export default function TradesPage() {
  const { projections, goldenBoyTd, seasonStats } = usePortfolio();
  const [tab, setTab] = useState<Verdict | "depth">("buy-low");
  return (
    <Ready>
      {(portfolio, players) => {
        const throughWeek = portfolio.week;
        const noGames = !seasonStats || Object.values(seasonStats).every((w) => Object.keys(w).length === 0);
        const trends = noGames ? [] : buildTrends(portfolio, players, {
          weekly: seasonStats!,
          projByWeek: { [throughWeek]: projections?.projections ?? {} },
          tdPct: goldenBoyTd,
          throughWeek,
        });
        const buy = trends.filter((t) => t.verdict === "buy-low");
        const sell = trends.filter((t) => t.verdict === "sell-high");
        const hold = trends.filter((t) => t.verdict === "hold");
        const lowConf = trends.length > 0 && trends.every((t) => t.confidence === "low");
        const shown = tab === "depth" ? [] : tab === "buy-low" ? buy : tab === "sell-high" ? sell : hold;

        return (
          <>
            <PageHeader title="Trade targets"
              sub={<>Buy-low / sell-high reads on the players you roster, from actual points vs. projection and how sustainable the scoring is (volume vs. touchdown luck). {noGames ? "No games have been played yet this season — check back after Week 1 kicks off." : lowConf ? <span className="text-warn">Only {throughWeek} week{throughWeek === 1 ? "" : "s"} in — treat these as early signals, not verdicts. They firm up around Week 4.</span> : "Confidence rises with sample size; the dots show how many games back each call."}</>}
              actions={<Segmented value={tab} onChange={setTab} options={[{ value: "buy-low", label: "Buy low", count: buy.length }, { value: "sell-high", label: "Sell high", count: sell.length }, { value: "hold", label: "Hold", count: hold.length }, { value: "depth", label: "Depth" }]} />} />

            {!noGames && tab !== "depth" && (
              <div className="grid grid-cols-3 gap-3 mb-5">
                <StatTile label="Buy-low" value={buy.length} sub="underproducing on real volume" tone="ok" />
                <StatTile label="Sell-high" value={sell.length} sub="hot on unsustainable scoring" tone="urgent" />
                <StatTile label="Games in" value={throughWeek} sub={lowConf ? "early — low confidence" : "confidence building"} tone={lowConf ? "gold" : "muted"} />
              </div>
            )}

            {tab === "depth" ? (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {portfolio.leagues.map((b) => (
                  <Card key={b.league.league_id} title={b.league.name} actions={<span className="caption">{b.format.isDynasty ? "Dynasty" : "Redraft"} · {b.format.superflex ? "SF" : "1QB"} · {b.format.scoring}</span>}>
                    <div className="grid gap-1.5 text-[13.5px]">
                      {["QB", "RB", "WR", "TE"].map((pos) => {
                        const d = positionalDepth(b, players, pos);
                        const thin = d.healthy <= d.starterSlots;
                        return <div key={pos} className="flex items-center justify-between"><span className="flex items-center gap-2"><PositionBadge pos={pos} /><span className="text-muted">{d.starterSlots} start{d.flexSlots ? `, ${d.flexSlots} flex` : ""}</span></span><span className={thin ? "text-warn num" : "num"}>{d.healthy}<span className="text-muted"> / {d.total}</span></span></div>;
                      })}
                    </div>
                    <p className="caption mt-3">{b.format.tradeDeadline ? `Trade deadline week ${b.format.tradeDeadline}.` : "No trade deadline set."} Thin spots (orange) are where a trade helps most.</p>
                  </Card>
                ))}
              </div>
            ) : noGames ? (
              <EmptyState title="No games played yet" detail="Buy-low and sell-high reads need actual results to compare against projections. This lights up once Week 1 games are in the books." />
            ) : shown.length === 0 ? (
              <EmptyState title={`No ${LABEL[tab as Verdict].toLowerCase()} calls right now`} detail={tab === "buy-low" ? "Nobody you roster is underproducing on strong volume yet." : tab === "sell-high" ? "None of your players are running hot on unsustainable scoring." : "Nothing sitting in neutral."} />
            ) : (
              <Card pad={false}><div className="divide-y divide-line">{shown.map((t) => <TrendRow key={t.playerId} t={t} players={players} />)}</div></Card>
            )}

            <p className="caption mt-4">Reads cover QB/RB/WR/TE you roster. &quot;vs proj&quot; is your points minus projection per game; buy-low = under projection but the targets/carries are still there; sell-high = over projection on touchdown luck or thin volume. Signals to investigate, not instructions — and no fair-value math yet (that needs a trade-value source, a later add). {goldenBoyTd && Object.keys(goldenBoyTd).length > 0 ? "TD outlook from Fantasy Golden Boy." : ""}</p>
          </>
        );
      }}
    </Ready>
  );
}
