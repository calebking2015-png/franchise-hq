"use client";

import Link from "next/link";
import { useState } from "react";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, PageHeader, PlayerCell, PositionBadge, Segmented, StatTile, cx, fmtPts } from "@/components/ui";
import { positionalDepth } from "@/lib/analysis/exposure";
import { buildTrends, type Trend, type Verdict } from "@/lib/analysis/trends";
import { fcKey, evalTrade, leagueTeamValues, type ValueMap } from "@/lib/values";
import type { LeagueBundle } from "@/lib/portfolio/types";
import { SearchInput } from "@/components/ui";
import type { PlayerMap } from "@/lib/sleeper/types";

const LABEL: Record<Verdict, string> = { "buy-low": "Buy low", "sell-high": "Sell high", hold: "Hold" };
const TONE: Record<Verdict, string> = { "buy-low": "text-ok", "sell-high": "text-urgent", hold: "text-muted" };
const BG: Record<Verdict, string> = { "buy-low": "bg-ok/12 text-ok", "sell-high": "bg-urgent/12 text-urgent", hold: "chip-outline text-muted" };

function ConfDot({ c }: { c: Trend["confidence"] }) {
  const n = c === "high" ? 3 : c === "medium" ? 2 : 1;
  return <span className="inline-flex gap-0.5 items-center" title={`${c} confidence — based on ${c === "low" ? "1–2" : c === "medium" ? "3–4" : "5+"} games`}>{[0, 1, 2].map((i) => <span key={i} className={cx("w-1.5 h-1.5 rounded-full", i < n ? "bg-gold" : "bg-line-2")} />)}</span>;
}

function TrendRow({ t, players, value }: { t: Trend; players: PlayerMap; value?: number }) {
  const p = players[t.playerId];
  if (!p) return null;
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <PlayerCell player={p} id={t.playerId} showHeadshot={false} />
        <div className="flex items-center gap-2 shrink-0">{value != null && value > 0 && <span className="num caption" title="FantasyCalc trade value">{value.toLocaleString()}</span>}<span className={cx("chip", BG[t.verdict])}>{LABEL[t.verdict]}</span></div>
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

function TradeEvaluator({ portfolio, players, values }: { portfolio: ReturnType<typeof usePortfolio>["portfolio"] extends infer P ? (P extends null ? never : P) : never; players: PlayerMap; values: Record<string, ValueMap> }) {
  const [leagueId, setLeagueId] = useState(portfolio.leagues[0]?.league.league_id ?? "");
  const b = portfolio.leagues.find((x) => x.league.league_id === leagueId) ?? portfolio.leagues[0];
  const vmap = values[fcKey(b.format)] ?? {};
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [q, setQ] = useState("");

  const myIds = (b.myRoster?.players ?? []).filter((id) => players[id]);
  const otherIds = b.rosters.filter((r) => r.roster_id !== b.myRosterId).flatMap((r) => r.players ?? []).filter((id) => players[id]);
  const search = (pool: string[]) => {
    const term = q.trim().toLowerCase();
    return pool.filter((id) => !give.includes(id) && !get.includes(id) && (!term || players[id]?.name.toLowerCase().includes(term)))
      .sort((a, c) => (vmap[c]?.value ?? 0) - (vmap[a]?.value ?? 0)).slice(0, term ? 8 : 6);
  };
  const ev = evalTrade(give, get, vmap);
  const hasValues = Object.keys(vmap).length > 0;
  const chip = (id: string, side: "give" | "get") => (
    <button key={id} type="button" onClick={() => (side === "give" ? setGive(give.filter((x) => x !== id)) : setGet(get.filter((x) => x !== id)))}
      className="chip chip-outline flex items-center gap-1.5 hover:border-urgent">{players[id]?.name}<span className="num caption">{(vmap[id]?.value ?? 0).toLocaleString()}</span><span className="text-faint">×</span></button>
  );
  const pick = (id: string, side: "give" | "get") => (
    <button key={id} type="button" onClick={() => (side === "give" ? setGive([...give, id]) : setGet([...get, id]))}
      className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-2 text-left">
      <PlayerCell player={players[id]} id={id} showHeadshot={false} /><span className="num caption">{(vmap[id]?.value ?? 0).toLocaleString()}</span></button>
  );

  return (
    <Card pad={false}
      title="Trade evaluator"
      actions={<select value={leagueId} onChange={(e) => { setLeagueId(e.target.value); setGive([]); setGet([]); }} className="field text-[13px] py-1">{portfolio.leagues.map((x) => <option key={x.league.league_id} value={x.league.league_id}>{x.league.name}</option>)}</select>}>
      <div className="p-4">
        {!hasValues ? <EmptyState title="Values loading…" detail="FantasyCalc values for this league format haven't loaded yet. Give it a moment or hit refresh." /> : (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="caption mb-1">You give</div>
                <div className="flex flex-wrap gap-1.5 min-h-[34px] mb-1">{give.length ? give.map((id) => chip(id, "give")) : <span className="caption self-center">Add your players below</span>}</div>
                <div className="num text-[15px]">Total: {ev.giveTotal.toLocaleString()}</div>
              </div>
              <div>
                <div className="caption mb-1">You get</div>
                <div className="flex flex-wrap gap-1.5 min-h-[34px] mb-1">{get.length ? get.map((id) => chip(id, "get")) : <span className="caption self-center">Add their players below</span>}</div>
                <div className="num text-[15px]">Total: {ev.getTotal.toLocaleString()}</div>
              </div>
            </div>

            {(give.length > 0 || get.length > 0) && (
              <div className={cx("mt-4 rounded-lg px-4 py-3 flex items-center justify-between", ev.verdict === "fair" ? "bg-surface-2" : ev.verdict === "you win" ? "bg-ok/12" : "bg-urgent/12")}>
                <div>
                  <div className={cx("font-semibold", ev.verdict === "fair" ? "" : ev.verdict === "you win" ? "text-ok" : "text-urgent")}>{ev.verdict === "fair" ? "Fair trade" : ev.verdict === "you win" ? "You win the value" : "You lose the value"}</div>
                  <div className="caption">{ev.diff === 0 ? "Even" : `${ev.diff > 0 ? "+" : ""}${ev.diff.toLocaleString()} (${ev.pct > 0 ? "+" : ""}${ev.pct}%)`} · within 10% counts as fair</div>
                </div>
                <div className={cx("num text-[26px] font-semibold", ev.verdict === "fair" ? "text-muted" : ev.verdict === "you win" ? "text-ok" : "text-urgent")}>{ev.pct > 0 ? "+" : ""}{ev.pct}%</div>
              </div>
            )}

            <div className="mt-4"><SearchInput value={q} onChange={setQ} placeholder="Search a player to add" /></div>
            <div className="grid sm:grid-cols-2 gap-3 mt-2">
              <div className="card-2 rounded-lg overflow-hidden"><div className="px-3 py-1.5 caption bg-surface-2">Your roster</div><div className="divide-y divide-line">{search(myIds).map((id) => pick(id, "give"))}</div></div>
              <div className="card-2 rounded-lg overflow-hidden"><div className="px-3 py-1.5 caption bg-surface-2">Their rosters ({b.teams.length - 1} teams)</div><div className="divide-y divide-line">{search(otherIds).map((id) => pick(id, "get"))}</div></div>
            </div>
          </>
        )}
      </div>
      <p className="caption px-4 pb-3">Values from <a href="https://fantasycalc.com" target="_blank" rel="noreferrer" className="text-gold hover:underline">FantasyCalc</a>, matched to this league&apos;s format ({b.format.isDynasty ? "dynasty" : "redraft"} · {b.format.superflex ? "SF" : "1QB"} · {b.format.scoring}). A fair-value gut check, not a projection of who&apos;ll play better.</p>
    </Card>
  );
}

function TeamValueView({ portfolio, players, values }: { portfolio: NonNullable<ReturnType<typeof usePortfolio>["portfolio"]>; players: PlayerMap; values: Record<string, ValueMap> }) {
  const [leagueId, setLeagueId] = useState(portfolio.leagues[0]?.league.league_id ?? "");
  const b = portfolio.leagues.find((x) => x.league.league_id === leagueId) ?? portfolio.leagues[0];
  const vmap = values[fcKey(b.format)] ?? {};
  const teams = leagueTeamValues(b.rosters, b.teams.map((t) => ({ rosterId: t.rosterId, teamName: t.teamName, ownerName: t.ownerName })), b.myRosterId, vmap);
  const me = teams.find((t) => t.isMe);
  const max = Math.max(...teams.map((t) => t.total), 1);
  const hasValues = Object.keys(vmap).length > 0;
  return (
    <Card pad={false} title="Team value" actions={<select value={leagueId} onChange={(e) => setLeagueId(e.target.value)} className="field text-[13px] py-1">{portfolio.leagues.map((x) => <option key={x.league.league_id} value={x.league.league_id}>{x.league.name}</option>)}</select>}>
      {!hasValues ? <div className="p-4"><EmptyState title="Values loading…" detail="FantasyCalc values for this league format haven't loaded yet." /></div> : (
        <>
          {me && <div className="px-4 py-3 border-b border-line flex items-center gap-3"><span className="caption">Your roster ranks</span><span className="num text-[22px] font-semibold">{me.rank}<span className="text-muted text-[15px]"> / {teams.length}</span></span><span className="caption">in trade value · {me.total.toLocaleString()} total</span></div>}
          <div className="divide-y divide-line">
            {teams.map((t) => (
              <div key={t.rosterId} className={cx("px-4 py-3", t.isMe && "bg-gold/5")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0"><span className="num text-muted w-5">{t.rank}</span><span className={cx("truncate font-medium", t.isMe && "text-gold")}>{t.teamName}{t.isMe && " (you)"}</span></div>
                  <span className="num font-semibold shrink-0">{t.total.toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-2"><div className={cx("h-full rounded-full", t.isMe ? "bg-gold" : "bg-line-2")} style={{ width: `${(t.total / max) * 100}%` }} /></div>
                <div className="caption mt-1.5 flex flex-wrap gap-x-3"><span>Starters {t.starters.toLocaleString()} · bench {t.bench.toLocaleString()}</span><span className="text-faint">Top: {t.top.filter((x) => x.value > 0).map((x) => players[x.id]?.name).join(", ")}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="caption px-4 py-3">Roster value totals from <a href="https://fantasycalc.com" target="_blank" rel="noreferrer" className="text-gold hover:underline">FantasyCalc</a>, computed here from Sleeper rosters — nothing is linked to a FantasyCalc account. A rough read on who holds the trade capital in each league.</p>
    </Card>
  );
}

export default function TradesPage() {
  const { projections, goldenBoyTd, seasonStats, values } = usePortfolio();
  const [tab, setTab] = useState<Verdict | "depth" | "evaluate" | "value">("buy-low");
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
              actions={<Segmented value={tab} onChange={setTab} options={[{ value: "buy-low", label: "Buy low", count: buy.length }, { value: "sell-high", label: "Sell high", count: sell.length }, { value: "hold", label: "Hold", count: hold.length }, { value: "evaluate", label: "Evaluate" }, { value: "value", label: "Team value" }, { value: "depth", label: "Depth" }]} />} />

            {!noGames && tab !== "depth" && (
              <div className="grid grid-cols-3 gap-3 mb-5">
                <StatTile label="Buy-low" value={buy.length} sub="underproducing on real volume" tone="ok" />
                <StatTile label="Sell-high" value={sell.length} sub="hot on unsustainable scoring" tone="urgent" />
                <StatTile label="Games in" value={throughWeek} sub={lowConf ? "early — low confidence" : "confidence building"} tone={lowConf ? "gold" : "muted"} />
              </div>
            )}

            {tab === "value" ? (
              <TeamValueView portfolio={portfolio} players={players} values={values} />
            ) : tab === "evaluate" ? (
              <TradeEvaluator portfolio={portfolio} players={players} values={values} />
            ) : tab === "depth" ? (
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
              <Card pad={false}><div className="divide-y divide-line">{shown.map((t) => { const b = portfolio.leagues.find((x) => x.league.league_id === t.mine[0]?.leagueId); const v = b ? values[fcKey(b.format)]?.[t.playerId]?.value : undefined; return <TrendRow key={t.playerId} t={t} players={players} value={v} />; })}</div></Card>
            )}

            <p className="caption mt-4">Reads cover QB/RB/WR/TE you roster. &quot;vs proj&quot; is your points minus projection per game; buy-low = under projection but the targets/carries are still there; sell-high = over projection on touchdown luck or thin volume. Signals to investigate, not instructions — and no fair-value math yet (that needs a trade-value source, a later add). {goldenBoyTd && Object.keys(goldenBoyTd).length > 0 ? "TD outlook from Fantasy Golden Boy." : ""}</p>
          </>
        );
      }}
    </Ready>
  );
}
