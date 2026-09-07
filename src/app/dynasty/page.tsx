"use client";

import Link from "next/link";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, PageHeader, StatTile, Unavailable, cx, fmtPts } from "@/components/ui";
import { dynastySnapshot, myTeam, recordStr } from "@/lib/analysis/summary";

export default function DynastyPage() {
  return (
    <Ready>
      {(portfolio, players) => {
        const dyn = portfolio.leagues.filter((b) => b.format.isDynasty);
        if (dyn.length === 0) return <><PageHeader title="Dynasty" /><EmptyState title="No dynasty leagues" detail="Dynasty tools appear only when at least one of your Sleeper leagues is typed as dynasty." /></>;
        return (
          <>
            <PageHeader title="Dynasty" sub={`${dyn.length} dynasty league${dyn.length > 1 ? "s" : ""}. Roster age and taxi usage come from Sleeper; contender/rebuilder classification and dynasty values arrive in Phase 3 once a value provider is configured.`} />
            <div className="grid gap-4">
              {dyn.map((b) => {
                const s = dynastySnapshot(b, players); const me = myTeam(b);
                return (
                  <Card key={b.league.league_id} title={<Link href={`/leagues/${b.league.league_id}`} className="hover:text-gold">{b.league.name}</Link>} actions={<span className="caption">{me ? `${recordStr(me.record)} · ${me.standing} of ${b.format.teams}` : ""}</span>}>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <StatTile label="Avg starter age" value={s.avgStarterAge ?? "—"} sub="QB/RB/WR/TE starters" />
                      <StatTile label="Avg roster age" value={s.avgRosterAge ?? "—"} sub={`${s.rosterSize} rostered`} />
                      <StatTile label="Under 25" value={s.under25} sub="youth core" tone="ok" />
                      <StatTile label="28 and older" value={s.over28} sub="aging assets" tone={s.over28 > s.under25 ? "urgent" : undefined} />
                      <StatTile label="Taxi" value={`${s.taxiCount}/${b.format.taxiSlots}`} sub={b.format.taxiSlots ? "slots used" : "no taxi squad"} tone="muted" />
                    </div>
                    <div className={cx("mt-3 caption flex flex-wrap gap-x-4 gap-y-1")}>
                      <span>Window: <Unavailable what="needs dynasty values + pick inventory" /></span>
                      <span>Points for: <span className="num text-ink">{me ? fmtPts(me.pointsFor, 0) : "—"}</span></span>
                      <Link href={`/leagues/${b.league.league_id}`} className="text-gold hover:underline">Traded picks →</Link>
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
