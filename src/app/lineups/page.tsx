"use client";

import Link from "next/link";
import { useState } from "react";
import { Ready, LineupTable, BenchList } from "@/components/fantasy";
import { Card, LeagueKindChip, PageHeader, Segmented } from "@/components/ui";
import { leagueAlerts } from "@/lib/analysis/alerts";
import { rosterGroups, opponentTeam } from "@/lib/analysis/summary";
import { formatSummary } from "@/lib/league/format";

type View = "issues" | "all";

export default function LineupsPage() {
  const [view, setView] = useState<View>("all");
  return (
    <Ready>
      {(portfolio, players) => {
        const withAlerts = portfolio.leagues.map((b) => ({ b, alerts: leagueAlerts(b, players).filter((a) => a.severity !== "info" || a.kind === "questionable_starting") }));
        const list = view === "issues" ? withAlerts.filter((x) => x.alerts.length) : withAlerts;
        return (
          <>
            <PageHeader title="Lineups" sub={`Every starting lineup for week ${portfolio.week}. Projections are Sleeper's, scored under each league's own settings. Kickoff times need a schedule provider.`}
              actions={<Segmented value={view} onChange={setView} options={[{ value: "all", label: "All leagues", count: portfolio.leagues.length }, { value: "issues", label: "With issues", count: withAlerts.filter((x) => x.alerts.length).length }]} />} />
            {list.length === 0 && <div className="caption">No lineup issues detected from Sleeper status flags.</div>}
            <div className="grid gap-4">
              {list.map(({ b, alerts }) => {
                const g = rosterGroups(b);
                const opp = opponentTeam(b);
                return (
                  <Card key={b.league.league_id} pad={false}
                    title={<Link href={`/leagues/${b.league.league_id}`} className="hover:text-gold flex items-center gap-2 flex-wrap">{b.league.name}<LeagueKindChip kind={b.format.kind} /><span className="caption font-normal">{formatSummary(b.format).slice(1).join(" · ")}</span></Link>}
                    actions={<div className="flex items-center gap-2 text-[12.5px]">{opp && <span className="text-muted hidden sm:inline">vs {opp.teamName}</span>}{alerts.length > 0 && <span className="chip bg-urgent/15 text-urgent num">{alerts.length} flag{alerts.length === 1 ? "" : "s"}</span>}</div>}>
                    {alerts.length > 0 && (
                      <ul className="px-4 py-2 border-b border-line text-[13px] grid gap-0.5">
                        {alerts.map((a) => <li key={a.id} className={a.severity === "urgent" ? "text-urgent" : a.severity === "warning" ? "text-warn" : "text-caution"}>{a.title} — <span className="text-muted">{a.detail}</span></li>)}
                      </ul>
                    )}
                    <div className="grid lg:grid-cols-[1fr_280px]">
                      <div className="overflow-x-auto"><LineupTable b={b} players={players} /></div>
                      <div className="border-t lg:border-t-0 lg:border-l border-line p-4 grid gap-4 content-start">
                        <BenchList ids={g.bench} players={players} label="Bench" />
                        <BenchList ids={g.ir} players={players} label="IR" />
                        {b.format.isDynasty && <BenchList ids={g.taxi} players={players} label="Taxi" />}
                        {g.bench.length === 0 && g.ir.length === 0 && <div className="caption">No bench players.</div>}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        );
      }}
    </Ready>
  );
}
