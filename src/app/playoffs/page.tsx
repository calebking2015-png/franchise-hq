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
import {
  simulateSeason,
  type SimTeamSeed, type SimWeekMatchup, type TeamSimResult,
} from "@/lib/analysis/simulator";
import type { LeagueBundle, Portfolio } from "@/lib/portfolio/types";

function pct(x: number | null) {
  return x == null ? "—" : `.${String(Math.round(x * 1000)).padStart(3, "0")}`;
}

/** 0.723 -> "72%", 0.032 -> "3.2%", 0 -> "0%". */
function fmtOdds(x: number | null) {
  if (x == null) return "—";
  const p = x * 100;
  if (p >= 99.95) return "~100%";
  if (p <= 0.05) return "<0.1%";
  return p >= 10 ? `${Math.round(p)}%` : `${p.toFixed(1)}%`;
}

function fmtExpRecord(r: TeamSimResult) {
  const w = r.expWins.toFixed(1);
  const l = r.expLosses.toFixed(1);
  const t = r.expTies >= 0.05 ? `-${r.expTies.toFixed(1)}` : "";
  return `${w}-${l}${t}`;
}

/** Run the Monte Carlo sim for one league from its bundle + fetched schedule. */
function buildLeagueSim(b: LeagueBundle, schedule: SeasonSchedule, nflWeek: number) {
  const playoffTeams = b.format.playoffTeams ?? 0;
  if (playoffTeams <= 0) return null;
  const seeds: SimTeamSeed[] = b.teams.map((t) => ({
    rosterId: t.rosterId,
    wins: t.record.wins,
    losses: t.record.losses,
    ties: t.record.ties,
    pointsFor: t.pointsFor,
    pointsAgainst: t.pointsAgainst,
  }));
  const end = (b.format.playoffStart ?? 15) - 1;
  const weeks: Record<number, SimWeekMatchup[]> = {};
  for (let w = nflWeek; w <= end; w++) {
    const seen = new Set<string>();
    const ms: SimWeekMatchup[] = [];
    for (const row of schedule[w] ?? []) {
      if (row.o == null) continue;
      const key = [row.r, row.o].sort((x, y) => x - y).join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      ms.push({ a: row.r, b: row.o });
    }
    weeks[w] = ms;
  }
  return simulateSeason(seeds, weeks, { playoffTeams, currentWeek: nflWeek, regSeasonEnd: end });
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

function OddsHero({ sim, ready }: { sim: TeamSimResult | null; ready: boolean }) {
  const hasBye = sim?.byePct != null;
  return (
    <div className="grid gap-1.5">
      <div className={cx("grid gap-3", hasBye ? "grid-cols-3" : "grid-cols-2")}>
        <StatTile
          label="Playoff odds"
          value={ready && sim ? fmtOdds(sim.playoffPct) : "—"}
          sub="10,000 sims"
          tone={sim ? (sim.playoffPct >= 0.5 ? "ok" : sim.playoffPct < 0.15 ? "urgent" : undefined) : undefined}
        />
        <StatTile
          label="Championship odds"
          value={ready && sim ? fmtOdds(sim.champPct) : "—"}
          sub="win the bracket"
        />
        {hasBye && (
          <StatTile
            label="First-round bye"
            value={ready && sim ? fmtOdds(sim.byePct) : "—"}
            sub="top seed payout"
          />
        )}
      </div>
      {ready && sim ? (
        <p className="caption">Sim expected finish: <span className="num font-medium">{fmtExpRecord(sim)}</span> — average final record across all sims.</p>
      ) : (
        <p className="caption">{ready ? "Schedule didn't load for this league — odds unavailable." : "Simulating…"}</p>
      )}
    </div>
  );
}

function TitleOddsTable({ b, sims, ready }: {
  b: LeagueBundle;
  sims: Record<number, TeamSimResult> | undefined;
  ready: boolean;
}) {
  if (!ready) return <p className="caption">Simulating…</p>;
  const rows = b.teams
    .map((team) => ({ team, sim: sims?.[team.rosterId] ?? null }))
    .filter((r): r is { team: (typeof b.teams)[number]; sim: TeamSimResult } => r.sim != null)
    .sort((a, z) => z.sim.champPct - a.sim.champPct);
  if (rows.length === 0) return <p className="caption">Schedule didn&apos;t load for this league — odds unavailable.</p>;
  return (
    <div className="grid gap-1.5">
      <div className="h3">Title odds</div>
      <ul className="grid gap-1">
        {rows.map(({ team, sim }, i) => (
          <li
            key={team.rosterId}
            className={cx(
              "flex items-baseline justify-between gap-2 text-[13.5px]",
              team.rosterId === b.myRosterId && "font-medium",
            )}
          >
            <span className="truncate">
              <span className="caption num">#{team.standing}</span> {team.teamName}{" "}
              <span className="caption num">{recordStr(team.record)}</span>
              {i === 0 && <span className="text-gold"> · Predicted champ</span>}
              {team.rosterId === b.myRosterId && <span className="caption"> · you</span>}
            </span>
            <span className="shrink-0 num">
              <span className="caption">Playoff </span>
              {fmtOdds(sim.playoffPct)}
              <span className="caption"> · Title </span>
              {fmtOdds(sim.champPct)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LeaguePlayoffCard({ b, picture, sim, allSims, simReady, scheduleLoaded }: {
  b: LeagueBundle;
  picture: PlayoffPicture;
  sim: TeamSimResult | null;
  allSims: Record<number, TeamSimResult> | undefined;
  simReady: boolean;
  scheduleLoaded: boolean;
}) {
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
        <OddsHero sim={sim} ready={simReady} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Seed" value={`#${picture.seed}`} sub={`${b.format.teams} teams · ${picture.playoffTeams} make it`} />
          <StatTile label="Record" value={<span className="num">{recordStr(picture.record)}</span>} sub={`${fmtPts(picture.pointsFor)} PF · ${fmtPts(picture.pointsAgainst)} PA`} />
          <StatTile
            label="Final spot"
            value={picture.clinched ? "Clinched" : picture.eliminated ? "Out (rough)" : formatGb(picture.gamesBackFinal)}
            sub={picture.finalSpot ? `vs ${picture.finalSpot.teamName}` : undefined}
            tone={picture.clinched ? "ok" : picture.eliminated ? "urgent" : undefined}
          />
          <StatTile
            label="Magic number"
            value={picture.magicNumber != null && picture.magicNumber > 0 ? <span className="num">{picture.magicNumber}</span> : "—"}
            sub={pictureSummary(picture)}
          />
        </div>

        <TitleOddsTable b={b} sims={allSims} ready={simReady} />

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

  // Monte Carlo sims run client-side on the already-fetched schedules — no extra requests.
  const sims = useMemo(() => {
    const out: Record<string, Record<number, TeamSimResult>> = {};
    for (const b of playoffLeagues) {
      const sched = schedules[b.league.league_id];
      if (!sched) continue;
      const res = buildLeagueSim(b, sched, portfolio.week);
      if (res) out[b.league.league_id] = res;
    }
    return out;
  }, [playoffLeagues, schedules, portfolio.week]);

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
        sub={`Week ${portfolio.week} · 10,000-sim playoff odds, clinch math, remaining schedule, deadline countdown.`}
      />
      {schedLoading && (
        <div className="grid gap-3 mb-4"><Skeleton h={180} /><Skeleton h={140} /></div>
      )}
      <div className="grid gap-4">
        {portfolio.leagues.map((b, i) => {
          const leagueSims = sims[b.league.league_id];
          return (
            <LeaguePlayoffCard
              key={b.league.league_id}
              b={b}
              picture={pictures[i]}
              sim={b.myRosterId != null && leagueSims ? leagueSims[b.myRosterId] ?? null : null}
              allSims={leagueSims}
              simReady={!schedLoading && !!leagueSims}
              scheduleLoaded={!schedLoading || !!schedules[b.league.league_id]}
            />
          );
        })}
      </div>
      <p className="caption mt-4">Odds come from a 10,000-season Monte Carlo sim: team strength from scoring averages, ~22&nbsp;pt weekly margin spread, current week onward simulated (games already played this week aren&apos;t locked in). Standings tiebreak is record, then points-for. Magic number = (regular-season games + 1) − your wins − (losses of the first team out).</p>
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
