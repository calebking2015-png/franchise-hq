"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, LeagueKindChip, PageHeader, Skeleton, StatTile, cx, fmtPts } from "@/components/ui";
import { recordStr } from "@/lib/analysis/summary";
import {
  buildPlayoffPicture, formatGb, pictureSummary,
  type PlayoffPicture, type SeasonSchedule,
} from "@/lib/analysis/playoffs";
import type { LeagueBundle, Portfolio } from "@/lib/portfolio/types";

function pct(x: number | null) {
  return x == null ? "—" : `.${String(Math.round(x * 1000)).padStart(3, "0")}`;
}

function DeadlineBlock({ p, isDynasty }: { p: PlayoffPicture; isDynasty: boolean }) {
  if (p.tradeDeadlineWeek == null) return <p className="caption">No trade deadline set in Sleeper.</p>;
  const left = p.deadlineWeeksLeft ?? 0;
  const head = left > 0 ? `Week ${p.tradeDeadlineWeek} · ${left} week${left === 1 ? "" : "s"} left` : left === 0 ? `Week ${p.tradeDeadlineWeek} · this week` : "Deadline passed";
  const tone = left > 0 ? "text-gold" : "text-muted";
  let advice: string;
  if (left <= 0) advice = "Deadline is behind you — ride the roster you have.";
  else if (p.contender) advice = "You're in the playoff picture — consolidate depth into starters with 2-for-1s before the deadline.";
  else advice = isDynasty ? "You're outside the picture — sell veteran production for picks and young upside." : "You're outside the picture — shop win-now pieces to contenders for upgrades at your thin spots.";
  return (
    <div className="grid gap-1">
      <div className={cx("font-medium num", tone)}>{head}</div>
      <p className="caption">{advice}</p>
    </div>
  );
}

function LeaguePlayoffCard({ b, picture, scheduleLoaded }: { b: LeagueBundle; picture: PlayoffPicture; scheduleLoaded: boolean }) {
  if (!picture.hasPlayoffs) {
    return (
      <Card title={<div className="flex items-center justify-between gap-2"><span className="h3 truncate">{b.league.name}</span><LeagueKindChip kind={b.format.kind} /></div>}>
        <div className="grid gap-2">
          <div className="num text-[22px] font-semibold">{recordStr(picture.record)}</div>
          <p className="caption">No playoff format set in Sleeper for this league — clinch math needs playoff teams and a playoff start week.</p>
        </div>
      </Card>
    );
  }
  const sosNote =
    picture.sosRemaining != null && picture.sosFaced != null
      ? picture.sosRemaining < picture.sosFaced - 0.02
        ? "Softer road than you've faced."
        : picture.sosRemaining > picture.sosFaced + 0.02
          ? "Tougher road than you've faced."
          : "About the same difficulty as you've faced."
      : null;
  return (
    <Card
      title={
        <div className="flex items-center justify-between gap-2">
          <Link href={`/leagues/${b.league.league_id}`} className="h3 truncate hover:text-gold">{b.league.name}</Link>
          <LeagueKindChip kind={b.format.kind} />
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Seed" value={`#${picture.seed}`} sub={`${b.format.teams} teams · ${picture.playoffTeams} make it`} />
          <StatTile label="Record" value={<span className="num">{recordStr(picture.record)}</span>} sub={`${fmtPts(picture.pointsFor)} PF · ${fmtPts(picture.pointsAgainst)} PA`} />
          <StatTile
            label="Final spot"
            value={picture.clinched ? "Clinched" : picture.eliminated ? "Out (rough)" : formatGb(picture.gamesBackFinal)}
            sub={picture.firstOut ? `vs ${picture.firstOut.teamName}` : undefined}
            tone={picture.clinched ? "ok" : picture.eliminated ? "urgent" : undefined}
          />
          <StatTile
            label="Magic number"
            value={picture.magicNumber != null && picture.magicNumber > 0 ? <span className="num">{picture.magicNumber}</span> : "—"}
            sub={pictureSummary(picture)}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <div className="h3">Rest of season</div>
            {!scheduleLoaded ? (
              <p className="caption">Loading schedule…</p>
            ) : (
              <>
                <div className="flex gap-4 text-[13.5px]">
                  <span>Opp win% remaining <span className="num font-medium">{pct(picture.sosRemaining)}</span></span>
                  <span>Opp win% faced <span className="num font-medium">{pct(picture.sosFaced)}</span></span>
                </div>
                {sosNote && <p className="caption">{sosNote}</p>}
                {picture.projWins != null && (
                  <p className="caption">Rough projected finish: <span className="num font-medium">{picture.projWins.toFixed(1)}-{picture.projLosses!.toFixed(1)}</span> from PF/PA differentials — direction, not destiny.</p>
                )}
              </>
            )}
          </div>
          <div className="grid gap-1.5">
            <div className="h3">Trade deadline</div>
            <DeadlineBlock p={picture} isDynasty={b.format.isDynasty} />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <div className="h3">Root against</div>
            {picture.rootAgainst.length === 0 ? (
              <p className="caption">Nobody within two games ahead of you — or you're already top of the pile.</p>
            ) : (
              <ul className="grid gap-1">
                {picture.rootAgainst.map(({ team, gamesAhead }) => (
                  <li key={team.rosterId} className="flex items-baseline justify-between gap-2 text-[13.5px]">
                    <span className="truncate">#{team.standing} {team.teamName} <span className="caption num">{recordStr(team.record)}</span></span>
                    <span className="caption num shrink-0">{gamesAhead === 0 ? "tied" : `${gamesAhead % 1 ? gamesAhead.toFixed(1) : gamesAhead} ahead`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-1.5">
            <div className="h3">Key games this week</div>
            {!scheduleLoaded ? (
              <p className="caption">Loading schedule…</p>
            ) : picture.keyMatchups.length === 0 ? (
              <p className="caption">No bubble games found this week.</p>
            ) : (
              <ul className="grid gap-1">
                {picture.keyMatchups.map((m, i) => (
                  <li key={i} className={cx("text-[13.5px]", m.involvesMe && "font-medium")}>{m.note}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PlayoffsView({ portfolio }: { portfolio: Portfolio }) {
  const [schedules, setSchedules] = useState<Record<string, SeasonSchedule>>({});
  const [schedLoading, setSchedLoading] = useState(false);

  const playoffLeagues = useMemo(
    () => portfolio.leagues.filter((b) => b.format.playoffTeams && b.format.playoffTeams > 0),
    [portfolio],
  );

  useEffect(() => {
    let cancelled = false;
    setSchedLoading(true);
    Promise.all(
      playoffLeagues.map(async (b) => {
        const end = (b.format.playoffStart ?? 15) - 1;
        try {
          const res = await fetch(`/api/sleeper/playoffs?id=${b.league.league_id}&end=${end}`);
          if (!res.ok) return null;
          const json = (await res.json()) as { weeks: SeasonSchedule };
          return { id: b.league.league_id, weeks: json.weeks };
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, SeasonSchedule> = {};
      for (const r of rows) if (r) next[r.id] = r.weeks;
      setSchedules(next);
      setSchedLoading(false);
    });
    return () => { cancelled = true; };
  }, [playoffLeagues]);

  const pictures = useMemo(
    () => portfolio.leagues.map((b) => buildPlayoffPicture(b, schedules[b.league.league_id] ?? null, portfolio.week)),
    [portfolio, schedules],
  );
  const withPlayoffs = pictures.filter((p) => p.hasPlayoffs);
  if (withPlayoffs.length === 0 && !schedLoading) {
    return (
      <>
        <PageHeader title="Playoff Push" />
        <EmptyState title="No playoff formats found" detail="None of your leagues have playoff teams set in Sleeper, so there's no clinch math to run." />
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Playoff Push"
        sub={`Week ${portfolio.week} · clinch math, remaining schedule, deadline countdown. Projections are rough — direction, not destiny.`}
      />
      {schedLoading && (
        <div className="grid gap-3 mb-4"><Skeleton h={180} /><Skeleton h={140} /></div>
      )}
      <div className="grid gap-4">
        {portfolio.leagues.map((b, i) => (
          <LeaguePlayoffCard key={b.league.league_id} b={b} picture={pictures[i]} scheduleLoaded={!schedLoading || !!schedules[b.league.league_id]} />
        ))}
      </div>
      <p className="caption mt-4">Magic number = (regular-season games + 1) − your wins − (losses of the first team out). Remaining schedule strength uses each opponent&apos;s current win%. Tiebreakers beyond record-then-points-for are not modeled.</p>
    </>
  );
}

export default function PlayoffsPage() {
  return (
    <Ready>
      {(portfolio) => <PlayoffsView portfolio={portfolio} />}
    </Ready>
  );
}
