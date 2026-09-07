"use client";

import Link from "next/link";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import type { Portfolio, LeagueBundle } from "@/lib/portfolio/types";
import type { PlayerMap } from "@/lib/sleeper/types";
import type { Alert } from "@/lib/analysis/alerts";
import { formatSummary, slotLabel } from "@/lib/league/format";
import { myTeam, opponentTeam, recordStr, rosterGroups } from "@/lib/analysis/summary";
import { Card, cx, EmptyState, fmtPts, LeagueKindChip, PlayerCell, PlayerLink, PositionBadge, Skeleton, StatusBadge, TeamLogo, Unavailable } from "@/components/ui";

/** Renders children once portfolio + players are loaded; otherwise skeletons / errors. */
export function Ready({ children }: { children: (p: Portfolio, players: PlayerMap) => React.ReactNode }) {
  const { portfolio, players, playersLoaded, loading, error, username } = usePortfolio();
  if (!portfolio && loading) {
    return (
      <div className="grid gap-3">
        <Skeleton h={28} w={240} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={84} />)}</div>
        <Skeleton h={180} /><Skeleton h={140} />
      </div>
    );
  }
  if (!portfolio) {
    return (
      <EmptyState
        title={`Couldn't load leagues for “${username}”`}
        detail={error ?? "Sleeper didn't respond."}
        action={<Link href="/settings" className="btn">Check the username in Settings</Link>}
      />
    );
  }
  if (portfolio.leagues.length === 0) {
    return <EmptyState title="No leagues found" detail={`Sleeper returned no ${portfolio.season} NFL leagues for ${portfolio.user.display_name}.`} />;
  }
  if (!playersLoaded) {
    return (
      <div className="grid gap-3">
        <div className="caption">Loading NFL player database…</div>
        <Skeleton h={180} /><Skeleton h={140} />
      </div>
    );
  }
  return <>{children(portfolio, players)}</>;
}

/* ---------- Alerts ---------- */

export function AlertRow({ a, players, showLeague = true }: { a: Alert; players: PlayerMap; showLeague?: boolean }) {
  const p = a.playerId ? players[a.playerId] : undefined;
  return (
    <div className={cx("flex items-start gap-3 py-2.5 pl-3 pr-2 border-l-[3px]", `sev-${a.severity}`)} style={{ borderLeftColor: "var(--sev)" }}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {p ? <PlayerLink player={p} className="font-medium">{a.title}</PlayerLink> : <span className="font-medium">{a.title}</span>}
          {a.slot && <span className="chip chip-outline num">{slotLabel(a.slot)}</span>}
        </div>
        <div className="caption">{a.detail}</div>
      </div>
      {showLeague && (
        <Link href={`/leagues/${a.leagueId}`} className="shrink-0 text-[12px] text-muted hover:text-gold text-right max-w-[9rem] truncate">{a.leagueName}</Link>
      )}
    </div>
  );
}

export function AlertGroupByLeague({ alerts, players, portfolio }: { alerts: Alert[]; players: PlayerMap; portfolio: Portfolio }) {
  const byLeague = new Map<string, Alert[]>();
  for (const a of alerts) byLeague.set(a.leagueId, [...(byLeague.get(a.leagueId) ?? []), a]);
  return (
    <div className="grid gap-3">
      {[...byLeague.entries()].map(([lid, list]) => {
        const b = portfolio.leagues.find((x) => x.league.league_id === lid);
        const urgent = list.filter((a) => a.severity === "urgent").length;
        const warn = list.filter((a) => a.severity === "warning").length;
        return (
          <Card key={lid} pad={false}
            title={<Link href={`/leagues/${lid}`} className="hover:text-gold flex items-center gap-2">{b?.league.name ?? lid}{b && <LeagueKindChip kind={b.format.kind} />}</Link>}
            actions={<div className="flex gap-1.5 text-[12px]">{urgent > 0 && <span className="chip bg-urgent/15 text-urgent num">{urgent} urgent</span>}{warn > 0 && <span className="chip bg-warn/15 text-warn num">{warn} warn</span>}</div>}>
            <div className="divide-y divide-line">{list.map((a) => <AlertRow key={a.id} a={a} players={players} showLeague={false} />)}</div>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------- League card ---------- */

export function LeagueCard({ b, alertCount }: { b: LeagueBundle; alertCount?: number }) {
  const me = myTeam(b);
  const opp = opponentTeam(b);
  const m = b.matchup;
  const live = m && m.oppPoints != null && (m.myPoints > 0 || m.oppPoints > 0);
  return (
    <Link href={`/leagues/${b.league.league_id}`} className="card p-4 flex flex-col gap-3 hover:border-line-2 focus-visible:border-gold">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="h3 truncate">{b.league.name}</div>
          <div className="caption truncate">{me?.teamName ?? "No team found"}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {alertCount ? <span className="chip bg-urgent/15 text-urgent num">{alertCount}</span> : null}
          <LeagueKindChip kind={b.format.kind} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1">{formatSummary(b.format).map((t) => <span key={t} className="chip chip-solid">{t}</span>)}</div>
      <div className="grid grid-cols-3 gap-2">
        <div><div className="caption">Record</div><div className="num text-[22px] font-semibold">{me ? recordStr(me.record) : "—"}</div></div>
        <div><div className="caption">Standing</div><div className="num text-[22px] font-semibold">{me ? <>{me.standing}<span className="text-muted text-[15px]">/{b.format.teams}</span></> : "—"}</div></div>
        <div><div className="caption">PF / PA</div><div className="num text-[15px] font-medium pt-1.5">{me ? <>{fmtPts(me.pointsFor, 0)} <span className="text-muted">/ {fmtPts(me.pointsAgainst, 0)}</span></> : "—"}</div></div>
      </div>
      <div className="border-t border-line pt-3 flex items-center justify-between gap-2 text-[13px]">
        {m ? (
          <>
            <span className="truncate">{live ? <span className="num font-semibold text-[16px]">{fmtPts(m.myPoints)}</span> : <span className="text-muted">Week {b.week}</span>} <span className="text-muted">vs</span> {opp?.teamName ?? "TBD"}</span>
            {live ? <span className="num font-semibold text-[16px]">{fmtPts(m.oppPoints)}</span> : <Unavailable what="Projection not configured" />}
          </>
        ) : (
          <span className="text-muted">{b.league.status === "pre_draft" ? "Not yet drafted" : "No matchup this week"}</span>
        )}
      </div>
    </Link>
  );
}

/* ---------- Lineup table ---------- */

export function LineupTable({ b, players, compact = false }: { b: LeagueBundle; players: PlayerMap; compact?: boolean }) {
  const g = rosterGroups(b);
  const m = b.matchup;
  const points = (pid: string | null, i: number) => (m && pid && m.myStarters[i] === pid ? m.myStarterPoints[i] : undefined);
  return (
    <table className="data">
      <thead><tr><th style={{ width: 56 }}>Slot</th><th>Player</th>{!compact && <th className="hidden md:table-cell">Opp</th>}{!compact && <th className="hidden md:table-cell">Kick</th>}<th className="r">Proj</th><th className="r">Pts</th></tr></thead>
      <tbody>
        {g.starters.map((s, i) => {
          const p = s.playerId ? players[s.playerId] : undefined;
          const pts = points(s.playerId, i);
          return (
            <tr key={`${s.slot}-${i}`} className={!s.playerId ? "bg-urgent/5" : ""}>
              <td><span className="chip chip-outline num">{slotLabel(s.slot)}</span></td>
              <td>{s.playerId ? <PlayerCell player={p} id={s.playerId} showHeadshot={!compact} /> : <span className="text-urgent font-medium">Empty slot</span>}</td>
              {!compact && <td className="hidden md:table-cell text-muted"><Unavailable what="—" /></td>}
              {!compact && <td className="hidden md:table-cell text-muted"><Unavailable what="—" /></td>}
              <td className="r"><Unavailable what="—" /></td>
              <td className="r num font-medium">{pts != null && pts !== 0 ? fmtPts(pts) : <span className="text-faint">—</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function BenchList({ ids, players, label, showLabel = true }: { ids: string[]; players: PlayerMap; label: string; showLabel?: boolean }) {
  if (ids.length === 0) return null;
  return (
    <div>
      {showLabel && <div className="caption mb-1.5">{label} · {ids.length}</div>}
      <div className="grid gap-1">
        {ids.map((id) => {
          const p = players[id];
          return (
            <div key={id} className="flex items-center gap-2 text-[13.5px]">
              {p ? <><PositionBadge pos={p.pos} /><PlayerLink player={p} className="truncate" /><TeamLogo team={p.team} size={14} /><span className="text-muted">{p.team ?? "FA"}</span><StatusBadge player={p} /></> : <span className="text-muted">Unknown ({id})</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
