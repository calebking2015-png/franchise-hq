"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Ready, LineupTable, BenchList, AlertRow } from "@/components/fantasy";
import { Card, EmptyState, LeagueKindChip, PageHeader, PlayerLink, PositionBadge, Segmented, StatTile, Unavailable, cx, fmtPts } from "@/components/ui";
import { leagueAlerts, sortAlerts, waiverAlerts, isHardOut } from "@/lib/analysis/alerts";
import { myTeam, opponentTeam, recordStr, rosterGroups } from "@/lib/analysis/summary";
import { formatSummary, slotLabel } from "@/lib/league/format";
import type { LeagueDetail } from "@/lib/portfolio/types";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { positionalDepth } from "@/lib/analysis/exposure";

type Tab = "roster" | "standings" | "matchup" | "transactions" | "available" | "settings" | "picks";

const SCORING_LABELS: Record<string, string> = {
  pass_yd: "Passing yard", pass_td: "Passing TD", pass_int: "Interception thrown", pass_2pt: "Passing 2-pt",
  rush_yd: "Rushing yard", rush_td: "Rushing TD", rush_2pt: "Rushing 2-pt", rec: "Reception", rec_yd: "Receiving yard", rec_td: "Receiving TD", rec_2pt: "Receiving 2-pt",
  fum_lost: "Fumble lost", fum: "Fumble", fum_rec_td: "Fumble recovery TD", bonus_rec_te: "TE reception bonus", bonus_rec_rb: "RB reception bonus", bonus_rec_wr: "WR reception bonus",
  bonus_pass_yd_300: "300+ passing yds", bonus_pass_yd_400: "400+ passing yds", bonus_rush_yd_100: "100+ rushing yds", bonus_rush_yd_200: "200+ rushing yds", bonus_rec_yd_100: "100+ receiving yds", bonus_rec_yd_200: "200+ receiving yds",
  xpm: "XP made", xpmiss: "XP missed", fgm_0_19: "FG 0-19", fgm_20_29: "FG 20-29", fgm_30_39: "FG 30-39", fgm_40_49: "FG 40-49", fgm_50p: "FG 50+", fgmiss: "FG missed",
  sack: "DST sack", int: "DST interception", ff: "DST forced fumble", fum_rec: "DST fumble recovery", def_td: "DST TD", safe: "Safety", blk_kick: "Blocked kick", def_st_td: "Special teams TD",
  pts_allow_0: "0 pts allowed", pts_allow_1_6: "1-6 pts allowed", pts_allow_7_13: "7-13 pts allowed", pts_allow_14_20: "14-20 pts allowed", pts_allow_21_27: "21-27 pts allowed", pts_allow_28_34: "28-34 pts allowed", pts_allow_35p: "35+ pts allowed",
};

export default function LeagueHub() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [tab, setTab] = useState<Tab>("roster");
  const [detail, setDetail] = useState<LeagueDetail | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const { portfolio, trending } = usePortfolio();
  const week = portfolio?.week ?? 1;

  useEffect(() => {
    if (!leagueId) return;
    setDetail(null);
    fetch(`/api/sleeper/league?id=${leagueId}&week=${week}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j as LeagueDetail; })
      .then(setDetail)
      .catch((e) => setDetailErr((e as Error).message));
  }, [leagueId, week]);

  return (
    <Ready>
      {(p, players) => {
        const b = p.leagues.find((x) => x.league.league_id === leagueId);
        if (!b) return <EmptyState title="League not found" detail="This league isn't in your current Sleeper portfolio." action={<Link href="/leagues" className="btn">Back to leagues</Link>} />;
        const me = myTeam(b);
        const opp = opponentTeam(b);
        const g = rosterGroups(b);
        const alerts = sortAlerts(leagueAlerts(b, players));
        const waiver = waiverAlerts(b, players, trending?.adds ?? [], 50);
        const teamName = (rid: number | null | undefined) => b.teams.find((t) => t.rosterId === rid)?.teamName ?? (rid != null ? `Roster ${rid}` : "—");
        const tabs: { value: Tab; label: string }[] = [
          { value: "roster", label: "Roster" }, { value: "matchup", label: "Matchup" }, { value: "standings", label: "Standings" },
          { value: "available", label: "Available" }, { value: "transactions", label: "Transactions" },
          ...(b.format.isDynasty ? [{ value: "picks" as Tab, label: "Picks" }] : []), { value: "settings", label: "Settings" },
        ];

        return (
          <>
            <div className="mb-1"><Link href="/leagues" className="caption hover:text-gold">← Leagues</Link></div>
            <PageHeader title={b.league.name}
              sub={<span className="flex flex-wrap items-center gap-1.5"><LeagueKindChip kind={b.format.kind} />{formatSummary(b.format).map((t) => <span key={t} className="chip chip-solid">{t}</span>)}<span className="chip chip-solid">{b.format.waiver}{b.format.faabBudget ? ` $${b.format.faabBudget}` : ""}</span></span>}
              actions={<a className="btn text-[13px]" href={`https://sleeper.com/leagues/${b.league.league_id}`} target="_blank" rel="noreferrer">Open in Sleeper</a>} />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <StatTile label={me?.teamName ?? "My team"} value={me ? recordStr(me.record) : "—"} sub={me ? `${me.standing} of ${b.format.teams}` : "Not on a roster"} />
              <StatTile label="Points for / against" value={me ? fmtPts(me.pointsFor, 0) : "—"} sub={me ? `${fmtPts(me.pointsAgainst, 0)} against` : undefined} />
              <StatTile label={`Week ${b.week}`} value={b.matchup ? `${fmtPts(b.matchup.myPoints)} – ${fmtPts(b.matchup.oppPoints)}` : "—"} sub={opp ? `vs ${opp.teamName}` : "No matchup"} />
              <StatTile label="Waiver" value={b.format.waiver === "FAAB" ? `$${(b.format.faabBudget ?? 0) - (me?.faabUsed ?? 0)}` : me?.waiverPosition ?? "—"} sub={b.format.waiver === "FAAB" ? `of $${b.format.faabBudget} remaining` : "Waiver priority"} />
            </div>

            {alerts.length > 0 && (
              <Card title="Recommendations" pad={false} className="mb-5" actions={<span className="caption">From Sleeper status flags</span>}>
                <div className="divide-y divide-line">{alerts.map((a) => <AlertRow key={a.id} a={a} players={players} showLeague={false} />)}</div>
              </Card>
            )}

            <Segmented value={tab} onChange={setTab} options={tabs} className="mb-4 w-fit" />

            {tab === "roster" && (
              <div className="grid lg:grid-cols-[1fr_300px] gap-4">
                <Card title="Starting lineup" pad={false}><div className="overflow-x-auto"><LineupTable b={b} players={players} /></div></Card>
                <div className="grid gap-4 content-start">
                  <Card title="Bench"><BenchList ids={g.bench} players={players} label="Bench" showLabel={false} />{g.bench.length === 0 && <span className="caption">Empty</span>}</Card>
                  {b.format.irSlots > 0 && <Card title={`IR · ${g.ir.length}/${b.format.irSlots}`}><BenchList ids={g.ir} players={players} label="IR" showLabel={false} />{g.ir.length === 0 && <span className="caption">Empty</span>}</Card>}
                  {b.format.isDynasty && b.format.taxiSlots > 0 && <Card title={`Taxi · ${g.taxi.length}/${b.format.taxiSlots}`}><BenchList ids={g.taxi} players={players} label="Taxi" showLabel={false} />{g.taxi.length === 0 && <span className="caption">Empty</span>}</Card>}
                  <Card title="Positional depth">
                    <div className="grid gap-1.5 text-[13.5px]">
                      {["QB", "RB", "WR", "TE", "K", "DEF"].map((pos) => {
                        const d = positionalDepth(b, players, pos);
                        if (d.starterSlots + d.flexSlots === 0 && d.total === 0) return null;
                        return <div key={pos} className="flex items-center justify-between"><span className="flex items-center gap-2"><PositionBadge pos={pos} /><span className="text-muted">{d.starterSlots} start{d.flexSlots ? ` +${d.flexSlots} flex` : ""}</span></span><span className="num">{d.healthy}<span className="text-muted"> healthy / {d.total}</span></span></div>;
                      })}
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {tab === "matchup" && (
              <Card title={b.matchup ? `${me?.teamName ?? "Me"} vs ${opp?.teamName ?? "TBD"}` : "No matchup"} pad={false}>
                {!b.matchup ? <div className="p-4 caption">Sleeper has no matchup for this week.</div> : (
                  <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line">
                    {[{ label: me?.teamName ?? "Me", starters: b.matchup.myStarters, pts: b.matchup.myStarterPoints, total: b.matchup.myPoints }, { label: opp?.teamName ?? "Opponent", starters: b.matchup.oppStarters, pts: b.matchup.oppStarterPoints, total: b.matchup.oppPoints }].map((side, si) => (
                      <div key={si}>
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line"><span className="h3">{side.label}</span><span className="num text-[22px] font-semibold">{fmtPts(side.total)}</span></div>
                        <table className="data"><tbody>
                          {side.starters.map((pid, i) => { const pl = players[pid]; return (
                            <tr key={`${pid}-${i}`}><td className="w-14"><span className="chip chip-outline num">{slotLabel(g.starters[i]?.slot ?? "")}</span></td><td>{pl ? <span className="flex items-center gap-2"><PositionBadge pos={pl.pos} /><PlayerLink player={pl} /><span className="text-muted text-[12px]">{pl.team}</span></span> : <span className="text-muted">{pid === "0" ? "Empty" : pid}</span>}</td><td className="r num">{side.pts[i] ? fmtPts(side.pts[i]) : <span className="text-faint">—</span>}</td></tr>
                          ); })}
                        </tbody></table>
                      </div>
                    ))}
                  </div>
                )}
                <div className="px-4 py-2 caption border-t border-line">Win probability and projected margin: <Unavailable what="projection provider not configured" />.</div>
              </Card>
            )}

            {tab === "standings" && (
              <Card pad={false}>
                <div className="overflow-x-auto"><table className="data">
                  <thead><tr><th>#</th><th>Team</th><th>Owner</th><th className="r">W-L</th><th className="r">PF</th><th className="r">PA</th>{b.format.waiver === "FAAB" ? <th className="r">FAAB left</th> : <th className="r">Waiver</th>}</tr></thead>
                  <tbody>{b.teams.map((t) => (
                    <tr key={t.rosterId} className={cx(t.rosterId === b.myRosterId && "bg-gold/5")}><td className="num text-muted">{t.standing}</td><td className="font-medium">{t.teamName}{t.rosterId === b.myRosterId && <span className="ml-2 chip bg-gold/15 text-gold">You</span>}</td><td className="text-muted">{t.ownerName}</td><td className="r num">{recordStr(t.record)}</td><td className="r num">{fmtPts(t.pointsFor, 1)}</td><td className="r num">{fmtPts(t.pointsAgainst, 1)}</td><td className="r num">{b.format.waiver === "FAAB" ? `$${(b.format.faabBudget ?? 0) - (t.faabUsed ?? 0)}` : t.waiverPosition ?? "—"}</td></tr>
                  ))}</tbody>
                </table></div>
              </Card>
            )}

            {tab === "available" && (
              <Card title="Trending adds available here" pad={false} actions={<span className="caption">Sleeper trending · last 24h</span>}>
                {waiver.length === 0 ? <div className="p-4 caption">None of Sleeper's top trending adds are on waivers in this league.</div> : (
                  <table className="data"><thead><tr><th>Player</th><th className="r">Adds</th><th className="r">Your depth</th></tr></thead><tbody>
                    {waiver.map((a) => { const pl = players[a.playerId!]; const d = positionalDepth(b, players, pl.pos); return (
                      <tr key={a.id}><td><span className="flex items-center gap-2"><PositionBadge pos={pl.pos} /><PlayerLink player={pl} /><span className="text-muted text-[12px]">{pl.team}</span></span></td><td className="r num">{a.detail.match(/\+[\d,]+/)?.[0]}</td><td className="r num text-muted">{d.healthy}/{d.total} {pl.pos}</td></tr>
                    ); })}
                  </tbody></table>
                )}
                <div className="px-4 py-2 caption border-t border-line">Add/drop recommendations need a ranking provider; this list is availability × Sleeper trend only.</div>
              </Card>
            )}

            {tab === "transactions" && (
              <Card title="Recent transactions" pad={false} actions={<span className="caption">Last 3 weeks</span>}>
                {detailErr && <div className="p-4 text-urgent text-[13px]">{detailErr}</div>}
                {!detail && !detailErr && <div className="p-4 caption">Loading…</div>}
                {detail && detail.transactions.length === 0 && <div className="p-4 caption">No transactions.</div>}
                {detail && detail.transactions.length > 0 && (
                  <div className="divide-y divide-line">{detail.transactions.slice(0, 60).map((t) => (
                    <div key={t.transaction_id} className="px-4 py-2.5 text-[13.5px] grid gap-0.5">
                      <div className="flex items-center gap-2 caption"><span className="chip chip-outline capitalize">{t.type.replace("_", " ")}</span><span>{new Date(t.created).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><span className={t.status === "complete" ? "text-ok" : "text-muted"}>{t.status}</span>{t.settings?.waiver_bid != null && <span className="num">${t.settings.waiver_bid}</span>}</div>
                      {t.adds && Object.entries(t.adds).map(([pid, rid]) => <div key={`a${pid}`} className="flex items-center gap-1.5"><span className="text-ok num">+</span>{players[pid] ? <PlayerLink player={players[pid]} /> : pid}<span className="text-muted">→ {teamName(rid)}</span></div>)}
                      {t.drops && Object.entries(t.drops).map(([pid, rid]) => <div key={`d${pid}`} className="flex items-center gap-1.5"><span className="text-urgent num">−</span>{players[pid] ? <PlayerLink player={players[pid]} /> : pid}<span className="text-muted">from {teamName(rid)}</span></div>)}
                      {t.draft_picks?.map((pk, i) => <div key={i} className="text-muted">{pk.season} R{pk.round} pick → {teamName(pk.owner_id)}</div>)}
                    </div>
                  ))}</div>
                )}
              </Card>
            )}

            {tab === "picks" && (
              <Card title="Traded draft picks" pad={false} actions={<span className="caption">Sleeper traded_picks · untraded picks assumed with original owner</span>}>
                {!detail ? <div className="p-4 caption">Loading…</div> : detail.tradedPicks.length === 0 ? <div className="p-4 caption">No picks have been traded in this league.</div> : (
                  <table className="data"><thead><tr><th>Season</th><th>Round</th><th>Original</th><th>Now owned by</th></tr></thead><tbody>
                    {[...detail.tradedPicks].sort((a, c) => a.season.localeCompare(c.season) || a.round - c.round).map((pk, i) => (
                      <tr key={i} className={cx(pk.owner_id === b.myRosterId && "bg-gold/5")}><td className="num">{pk.season}</td><td className="num">{pk.round}</td><td>{teamName(pk.roster_id)}</td><td className="font-medium">{teamName(pk.owner_id)}{pk.owner_id === b.myRosterId && <span className="ml-2 chip bg-gold/15 text-gold">You</span>}</td></tr>
                    ))}
                  </tbody></table>
                )}
              </Card>
            )}

            {tab === "settings" && (
              <div className="grid md:grid-cols-2 gap-4">
                <Card title="Roster">
                  <div className="flex flex-wrap gap-1.5">{b.format.starters.map((s) => <span key={s.slot} className="chip chip-solid num">{s.count}× {slotLabel(s.slot)}</span>)}<span className="chip chip-outline num">{b.format.benchSlots} BN</span>{b.format.irSlots > 0 && <span className="chip chip-outline num">{b.format.irSlots} IR</span>}{b.format.taxiSlots > 0 && <span className="chip chip-outline num">{b.format.taxiSlots} TAXI</span>}</div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4 text-[13.5px]">
                    <dt className="text-muted">Teams</dt><dd className="num">{b.format.teams}</dd>
                    <dt className="text-muted">Playoff teams</dt><dd className="num">{b.format.playoffTeams ?? "—"}</dd>
                    <dt className="text-muted">Playoffs start</dt><dd className="num">{b.format.playoffStart ? `Week ${b.format.playoffStart}` : "—"}</dd>
                    <dt className="text-muted">Trade deadline</dt><dd className="num">{b.format.tradeDeadline ? `Week ${b.format.tradeDeadline}` : "None"}</dd>
                    <dt className="text-muted">Waivers</dt><dd>{b.format.waiver}{b.format.faabBudget ? ` · $${b.format.faabBudget}` : ""}</dd>
                    <dt className="text-muted">Status</dt><dd className="capitalize">{b.league.status.replace("_", " ")}</dd>
                  </dl>
                </Card>
                <Card title="Scoring" pad={false}>
                  <table className="data"><tbody>
                    {Object.entries(b.league.scoring_settings ?? {}).filter(([, v]) => v !== 0).sort(([a], [c]) => (SCORING_LABELS[a] ? 0 : 1) - (SCORING_LABELS[c] ? 0 : 1) || a.localeCompare(c)).map(([k, v]) => (
                      <tr key={k}><td>{SCORING_LABELS[k] ?? <span className="text-muted">{k}</span>}</td><td className="r num">{v > 0 ? `+${v}` : v}</td></tr>
                    ))}
                  </tbody></table>
                </Card>
              </div>
            )}

            {me && g.starters.some((s) => s.playerId && isHardOut(players[s.playerId])) && tab !== "roster" && (
              <p className="caption mt-4">You have a starter flagged OUT/IR — see Roster tab.</p>
            )}
          </>
        );
      }}
    </Ready>
  );
}
