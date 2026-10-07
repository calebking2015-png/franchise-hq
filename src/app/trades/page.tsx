"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, PageHeader, PlayerCell, PlayerLink, PositionBadge, Segmented, Skeleton, StatTile, TeamLogo, cx, fmtPts } from "@/components/ui";
import { positionalDepth } from "@/lib/analysis/exposure";
import { buildTrends, type Trend, type Verdict } from "@/lib/analysis/trends";
import { fcKey, evalTrade, leagueTeamValues, type ValueMap } from "@/lib/values";
import { findTrades, balanceTrade } from "@/lib/values/finder";
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

            {(give.length > 0 || get.length > 0) && (() => {
              const bal = !b.format.isDynasty && give.length && get.length ? balanceTrade(give, get, vmap, { mine: myIds, theirs: otherIds }, players) : null;
              return bal && bal.suggestions.length ? (
                <div className="mt-3 rounded-lg px-4 py-2.5 bg-surface-2">
                  <div className="caption mb-1">To even it out, add to <span className="text-ink">{bal.addTo === "give" ? "your side" : "their side"}</span>:</div>
                  <div className="flex flex-wrap gap-1.5">{bal.suggestions.map((sug) => (
                    <button key={sug.id} type="button" onClick={() => (bal.addTo === "give" ? setGive([...give, sug.id]) : setGet([...get, sug.id]))} className="chip chip-outline hover:border-gold flex items-center gap-1.5">{players[sug.id]?.name}<span className="num caption">{sug.value.toLocaleString()}</span><span className="text-gold">+</span></button>
                  ))}</div>
                </div>
              ) : null;
            })()}
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

function TradeFinder({ portfolio, players, values }: { portfolio: NonNullable<ReturnType<typeof usePortfolio>["portfolio"]>; players: PlayerMap; values: Record<string, ValueMap> }) {
  const redraft = portfolio.leagues.filter((b) => !b.format.isDynasty);
  if (redraft.length === 0) return <EmptyState title="Redraft only" detail="The trade finder targets win-now value, so it runs on your redraft leagues. You don't have any this season." />;
  const ideasByLeague = redraft.map((b) => ({ b, ideas: findTrades(b, players, values[fcKey(b.format)] ?? {}) }));
  const anyValues = redraft.some((b) => Object.keys(values[fcKey(b.format)] ?? {}).length > 0);
  if (!anyValues) return <EmptyState title="Values loading…" detail="FantasyCalc redraft values haven't loaded yet — give it a moment and refresh." />;
  const total = ideasByLeague.reduce((n, x) => n + x.ideas.length, 0);
  if (total === 0) return <EmptyState title="No clear upgrades right now" detail="Nothing surfaced that upgrades a starting spot while staying fair by value. Your rosters are balanced, or there's no obvious trade partner. Check back as rosters shift." />;
  return (
    <div className="grid gap-4">
      <p className="caption">Fair-ish redraft deals that upgrade one of your starting spots — either filling a thin position or cashing bench depth into an upgrade. Candidates to explore, not instructions: they weigh value and roster fit, not your read on a matchup. Open the Evaluate tab to tweak any of them.</p>
      {ideasByLeague.filter((x) => x.ideas.length).map(({ b, ideas }) => (
        <Card key={b.league.league_id} pad={false} title={b.league.name} actions={<span className="caption">{ideas.length} idea{ideas.length === 1 ? "" : "s"}</span>}>
          <div className="divide-y divide-line">
            {ideas.map((idea, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={cx("chip text-[11px]", idea.kind === "fill-need" ? "bg-info/12 text-info" : "bg-ok/12 text-ok")}>{idea.kind === "fill-need" ? `Upgrade ${idea.upgradePos}` : `Cash ${idea.upgradePos} depth`}</span>
                  <span className="caption">vs {idea.partnerName} · {idea.pct > 0 ? "+" : ""}{idea.pct}% value</span>
                </div>
                <div className="grid sm:grid-cols-[1fr_auto_1fr] items-center gap-2 mt-2">
                  <div><div className="caption">You give ({idea.giveValue.toLocaleString()})</div>{idea.give.map((g) => <div key={g.id} className="text-[13.5px]"><PlayerLink player={players[g.id]} /></div>)}</div>
                  <span className="text-muted hidden sm:block">→</span>
                  <div className="sm:text-right"><div className="caption">You get ({idea.getValue.toLocaleString()})</div>{idea.get.map((g) => <div key={g.id} className="text-[13.5px] font-medium"><PlayerLink player={players[g.id]} /></div>)}</div>
                </div>
                <p className="caption mt-1.5">{idea.rationale}</p>
              </div>
            ))}
          </div>
        </Card>
      ))}
      <p className="caption">Values from <a href="https://fantasycalc.com" target="_blank" rel="noreferrer" className="text-gold hover:underline">FantasyCalc</a> (redraft). A fair value that fills a need isn&apos;t automatically the right move — check the matchup and who you actually rate before you send it.</p>
    </div>
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

type TradeCounts = Record<string, { count: number; lastWeek: number; lastSeason?: string }>;

interface TradePickMove { season: string; round: number; fromRosterId: number; origRosterId: number }
interface TradeDetailTeam {
  rosterId: number; teamName: string; isMe: boolean;
  receivedPlayers: string[]; gavePlayers: string[];
  receivedPicks: TradePickMove[]; gavePicks: TradePickMove[];
}
interface TradeDetail { season: string; week: number; teams: TradeDetailTeam[] }

function PickChip({ pick, teamNameOf }: { pick: TradePickMove; teamNameOf: (rid: number) => string }) {
  const via = pick.origRosterId !== pick.fromRosterId ? ` via ${teamNameOf(pick.origRosterId)}` : "";
  return <span className="chip chip-outline text-[11px]">{pick.season} R{pick.round}{via}</span>;
}

function TradeDetailsModal({ playerId, leagueId, scope, week, myRosterId, players, onClose }: {
  playerId: string; leagueId: string; scope: "season" | "alltime"; week: number;
  myRosterId: number | null; players: PlayerMap; onClose: () => void;
}) {
  const [trades, setTrades] = useState<TradeDetail[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const player = players[playerId];
  useEffect(() => {
    setTrades(null);
    setErr(null);
    const qs = new URLSearchParams({ id: leagueId, playerId, scope, throughWeek: String(week) });
    if (myRosterId != null) qs.set("myRosterId", String(myRosterId));
    fetch(`/api/sleeper/trade-details?${qs}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j as { trades: TradeDetail[] }; })
      .then((j) => setTrades(j.trades))
      .catch((e) => setErr((e as Error).message));
  }, [leagueId, playerId, scope, week, myRosterId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label={`Trade history: ${player?.name ?? playerId}`}>
      <div className="fixed inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative min-h-full flex items-center justify-center p-3 sm:p-6">
      <div className="relative card w-full max-w-3xl max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line shrink-0">
          <div className="min-w-0">
            <div className="h2 truncate">Trade history: {player?.name ?? playerId}</div>
            <div className="caption">{scope === "alltime" ? "Every completed trade, all time" : `Completed trades, weeks 1–${week}`}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="chip chip-outline shrink-0 hover:border-gold">✕</button>
        </div>
        <div className="overflow-y-auto min-h-0 p-4 grid gap-3">
          {err ? (
            <EmptyState title="Couldn't load trades" detail={err} />
          ) : trades === null ? (
            <div className="grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} h={64} />)}</div>
          ) : trades.length === 0 ? (
            <EmptyState title="No trades found" detail="No completed trades for this player in this range." />
          ) : (
            trades.map((t, i) => {
              const teamNameOf = (rid: number) => t.teams.find((x) => x.rosterId === rid)?.teamName ?? `Team ${rid}`;
              return (
                <div key={i} className="rounded-lg card-2 overflow-hidden">
                  <div className="px-3 py-2 bg-surface-2 font-medium text-[13px]">{t.season ? `${t.season} · ` : ""}Week {t.week}</div>
                  <div className="divide-y divide-line">
                    {t.teams.map((tm) => (
                      <div key={tm.rosterId} className={cx("px-3 py-2.5", tm.isMe && "bg-gold/5")}>
                        <div className={cx("font-medium text-[13.5px]", tm.isMe && "text-gold")}>{tm.teamName}{tm.isMe && " (you)"}</div>
                        {(tm.receivedPlayers.length > 0 || tm.receivedPicks.length > 0) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                            <span className="caption w-16 shrink-0">Received</span>
                            {tm.receivedPlayers.map((pid) => (
                              <span key={pid} className={cx(pid === playerId && "font-semibold text-gold")}><PlayerLink player={players[pid]} id={pid} /></span>
                            ))}
                            {tm.receivedPicks.map((pk, k) => <PickChip key={k} pick={pk} teamNameOf={teamNameOf} />)}
                          </div>
                        )}
                        {(tm.gavePlayers.length > 0 || tm.gavePicks.length > 0) && (
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                            <span className="caption w-16 shrink-0">Gave</span>
                            {tm.gavePlayers.map((pid) => (
                              <span key={pid} className={cx(pid === playerId && "font-semibold text-gold")}><PlayerLink player={players[pid]} id={pid} /></span>
                            ))}
                            {tm.gavePicks.map((pk, k) => <PickChip key={k} pick={pk} teamNameOf={teamNameOf} />)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function MostTradedView({ portfolio, players }: { portfolio: NonNullable<ReturnType<typeof usePortfolio>["portfolio"]>; players: PlayerMap }) {
  const first = portfolio.leagues[0];
  const [leagueId, setLeagueId] = useState(first?.league.league_id ?? "");
  const [scope, setScope] = useState<"season" | "alltime">(first?.format.isDynasty ? "alltime" : "season");
  const [counts, setCounts] = useState<TradeCounts | null>(null);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const week = portfolio.week;
  useEffect(() => {
    if (!leagueId) return;
    setCounts(null);
    setSeasons([]);
    setErr(null);
    fetch(`/api/sleeper/trade-counts?id=${leagueId}&throughWeek=${week}&scope=${scope}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j as { counts: TradeCounts; seasons: string[] }; })
      .then((j) => { setCounts(j.counts); setSeasons(j.seasons ?? []); })
      .catch((e) => setErr((e as Error).message));
  }, [leagueId, week, scope]);
  const rows = Object.entries(counts ?? {})
    .filter(([id]) => players[id])
    .sort((a, b) => b[1].count - a[1].count || (b[1].lastSeason ?? "").localeCompare(a[1].lastSeason ?? "") || b[1].lastWeek - a[1].lastWeek)
    .slice(0, 25);
  const max = Math.max(...rows.map(([, v]) => v.count), 1);
  const b = portfolio.leagues.find((x) => x.league.league_id === leagueId) ?? portfolio.leagues[0];
  const isDynasty = b?.format.isDynasty ?? false;
  const seasonRange = seasons.length <= 1 ? seasons[0] ?? "" : `${seasons[0]}–${seasons[seasons.length - 1]}`;
  return (
    <>
    <Card pad={false} title="Most traded" actions={<div className="flex items-center gap-2">{isDynasty && <Segmented value={scope} onChange={setScope} options={[{ value: "season", label: "This season" }, { value: "alltime", label: "All time" }]} />}<select value={leagueId} onChange={(e) => { const id = e.target.value; setLeagueId(id); setScope(portfolio.leagues.find((x) => x.league.league_id === id)?.format.isDynasty ? "alltime" : "season"); }} className="field text-[13px] py-1">{portfolio.leagues.map((x) => <option key={x.league.league_id} value={x.league.league_id}>{x.league.name}</option>)}</select></div>}>
      {err ? (
        <div className="p-4"><EmptyState title="Couldn't load trades" detail={err} /></div>
      ) : counts === null ? (
        <div className="p-4 grid gap-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={44} />)}</div>
      ) : rows.length === 0 ? (
        <div className="p-4"><EmptyState title={scope === "alltime" ? "No trades in league history" : "No trades yet this season"} detail={scope === "alltime" ? `${b.league.name} has no completed trades on record across ${seasonRange || "its history"}.` : `${b.league.name} hasn't had a completed trade through week ${week}.`} /></div>
      ) : (
        <div className="divide-y divide-line">
          {rows.map(([id, v], i) => (
            <div key={id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="num text-muted w-5">{i + 1}</span>
                  <button type="button" onClick={() => setDetailId(id)} title={`Trade history: ${players[id]?.name ?? id}`} className="min-w-0 text-left group">
                    <span className="font-medium block truncate group-hover:text-gold group-hover:underline underline-offset-2">{players[id]?.name ?? id}</span>
                    <span className="flex items-center gap-1.5 text-[12px] text-muted mt-0.5">
                      {players[id] && <><PositionBadge pos={players[id].pos} /><TeamLogo team={players[id].team} size={14} /><span>{players[id].team ?? "FA"}</span></>}
                    </span>
                  </button>
                </div>
                <span className="num font-semibold shrink-0">{v.count}× <span className="caption font-normal">traded</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-2"><div className="h-full rounded-full bg-gold" style={{ width: `${(v.count / max) * 100}%` }} /></div>
              <div className="caption mt-1.5">{scope === "alltime" && v.lastSeason ? `Last traded: ${v.lastSeason} Wk ${v.lastWeek}` : `Last traded week ${v.lastWeek}`}</div>
            </div>
          ))}
        </div>
      )}
      <p className="caption px-4 py-3">{scope === "alltime" ? <>Completed trades per player in {b.league.name}, all time{seasonRange ? ` (${seasonRange})` : ""}. A player moved twice in one deal counts once.</> : <>Completed trades per player in {b.league.name}, weeks 1–{week}. A player moved twice in one deal counts once.</>}</p>
    </Card>
    {detailId && (
      <TradeDetailsModal
        playerId={detailId}
        leagueId={leagueId}
        scope={scope}
        week={week}
        myRosterId={b.myRosterId}
        players={players}
        onClose={() => setDetailId(null)}
      />
    )}
    </>
  );
}

export default function TradesPage() {
  const { projections, goldenBoyTd, seasonStats, values } = usePortfolio();
  const [tab, setTab] = useState<Verdict | "depth" | "evaluate" | "value" | "find" | "most-traded">("buy-low");
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
              actions={<Segmented value={tab} onChange={setTab} options={[{ value: "buy-low", label: "Buy low", count: buy.length }, { value: "sell-high", label: "Sell high", count: sell.length }, { value: "hold", label: "Hold", count: hold.length }, { value: "find", label: "Find trades" }, { value: "evaluate", label: "Evaluate" }, { value: "value", label: "Team value" }, { value: "most-traded", label: "Most traded" }, { value: "depth", label: "Depth" }]} />} />

            {!noGames && tab !== "depth" && tab !== "most-traded" && (
              <div className="grid grid-cols-3 gap-3 mb-5">
                <StatTile label="Buy-low" value={buy.length} sub="underproducing on real volume" tone="ok" />
                <StatTile label="Sell-high" value={sell.length} sub="hot on unsustainable scoring" tone="urgent" />
                <StatTile label="Games in" value={throughWeek} sub={lowConf ? "early — low confidence" : "confidence building"} tone={lowConf ? "gold" : "muted"} />
              </div>
            )}

            {tab === "find" ? (
              <TradeFinder portfolio={portfolio} players={players} values={values} />
            ) : tab === "value" ? (
              <TeamValueView portfolio={portfolio} players={players} values={values} />
            ) : tab === "evaluate" ? (
              <TradeEvaluator portfolio={portfolio} players={players} values={values} />
            ) : tab === "most-traded" ? (
              <MostTradedView portfolio={portfolio} players={players} />
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

            {tab === "most-traded" ? (
              <p className="caption mt-4">Trade counts come from Sleeper&apos;s completed transactions for the selected league. A hot-potato player isn&apos;t automatically a buy or a sell — open the Evaluate tab before chasing one.</p>
            ) : (
              <p className="caption mt-4">Reads cover QB/RB/WR/TE you roster. &quot;vs proj&quot; is your points minus projection per game; buy-low = under projection but the targets/carries are still there; sell-high = over projection on touchdown luck or thin volume. Signals to investigate, not instructions — and no fair-value math yet (that needs a trade-value source, a later add). {goldenBoyTd && Object.keys(goldenBoyTd).length > 0 ? "TD outlook from Fantasy Golden Boy." : ""}</p>
            )}
          </>
        );
      }}
    </Ready>
  );
}
