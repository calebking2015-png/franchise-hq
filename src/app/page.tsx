"use client";

import Link from "next/link";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { Ready, AlertGroupByLeague, AlertRow, LeagueCard } from "@/components/fantasy";
import { Card, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { leagueAlerts, sortAlerts, waiverAlerts } from "@/lib/analysis/alerts";
import { combinedRecord, recordStr, totalOwned, weekRecord } from "@/lib/analysis/summary";
import { allExposure } from "@/lib/analysis/exposure";

export default function CommandCenter() {
  const { trending } = usePortfolio();
  return (
    <Ready>
      {(portfolio, players) => {
        const lineup = sortAlerts(portfolio.leagues.flatMap((b) => leagueAlerts(b, players)));
        const urgent = lineup.filter((a) => a.severity === "urgent");
        const warnings = lineup.filter((a) => a.severity === "warning");
        const info = lineup.filter((a) => a.severity === "info");
        const waivers = portfolio.leagues.flatMap((b) => waiverAlerts(b, players, trending?.adds ?? [], 10));
        const rec = combinedRecord(portfolio);
        const wk = weekRecord(portfolio);
        const dynasty = portfolio.leagues.filter((b) => b.format.isDynasty).length;
        const exposure = allExposure(portfolio, players);
        const leaguesNeedingAction = new Set([...urgent, ...warnings].map((a) => a.leagueId));
        const quiet = portfolio.leagues.filter((b) => !leaguesNeedingAction.has(b.league.league_id));

        return (
          <>
            <PageHeader title="Command Center" sub={<>{portfolio.state.season_type === "pre" ? "Preseason" : `Week ${portfolio.week}`} · {portfolio.season} · {portfolio.user.display_name}</>} />

            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
              <StatTile label="Leagues" value={portfolio.leagues.length} sub={`${portfolio.leagues.length - dynasty} redraft · ${dynasty} dynasty`} />
              <StatTile label="Season record" value={recordStr(rec)} sub="Combined across leagues" />
              <StatTile label={`Week ${portfolio.week}`} value={wk.pending === portfolio.leagues.length ? "—" : `${wk.winning}-${wk.losing}${wk.tied ? `-${wk.tied}` : ""}`} sub={wk.pending ? `${wk.pending} not started` : "Live from Sleeper"} tone={wk.winning > wk.losing ? "ok" : wk.losing > wk.winning ? "urgent" : undefined} />
              <StatTile label="Players owned" value={totalOwned(portfolio)} sub={`${exposure.length} unique`} />
              <StatTile label="Needs action" value={leaguesNeedingAction.size} sub={`${urgent.length} urgent · ${warnings.length} warnings`} tone={urgent.length ? "urgent" : leaguesNeedingAction.size ? undefined : "ok"} />
              <StatTile label="Waiver signals" value={waivers.length} sub="Trending adds you can grab" tone="muted" />
            </div>

            <section className="mb-8">
              <div className="flex flex-wrap items-end justify-between gap-x-3 mb-3">
                <h2 className="h2">Needs attention</h2>
                <span className="caption">Status flags from Sleeper · scan of {portfolio.leagues.length} lineups</span>
              </div>
              {urgent.length + warnings.length === 0 ? (
                <EmptyState title="Every lineup is clean" detail="No empty slots, no OUT/IR/suspended starters, no IR housekeeping. Questionable tags and waiver signals are listed below." />
              ) : (
                <AlertGroupByLeague alerts={[...urgent, ...warnings]} players={players} portfolio={portfolio} />
              )}
              {quiet.length > 0 && urgent.length + warnings.length > 0 && (
                <p className="caption mt-3">Quiet: {quiet.map((b) => b.league.name).join(", ")}</p>
              )}
            </section>

            <div className="grid lg:grid-cols-2 gap-4 mb-8">
              <Card title="Watch list" actions={<span className="caption">{info.length} questionable / housekeeping</span>} pad={false}>
                {info.length === 0 ? <div className="p-4 caption">Nothing to watch.</div> : (
                  <div className="divide-y divide-line max-h-[420px] overflow-auto">
                    {info.slice(0, 25).map((a) => <AlertRow key={a.id} a={a} players={players} />)}
                  </div>
                )}
              </Card>
              <Card title="Waiver radar" actions={<Link href="/waivers" className="text-[13px] text-gold hover:underline">Open waivers</Link>} pad={false}>
                {waivers.length === 0 ? <div className="p-4 caption">{trending ? "No top trending players are available in your leagues." : "Loading Sleeper trending adds…"}</div> : (
                  <div className="divide-y divide-line max-h-[420px] overflow-auto">
                    {waivers.slice(0, 20).map((a) => <AlertRow key={a.id} a={a} players={players} />)}
                  </div>
                )}
              </Card>
            </div>

            <section>
              <div className="flex items-end justify-between mb-3">
                <h2 className="h2">Leagues</h2>
                <Link href="/leagues" className="text-[13px] text-gold hover:underline">All leagues</Link>
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {portfolio.leagues.map((b) => <LeagueCard key={b.league.league_id} b={b} alertCount={lineup.filter((a) => a.leagueId === b.league.league_id && a.severity !== "info").length} />)}
              </div>
            </section>

            {portfolio.warnings.length > 0 && (
              <div className="mt-6 caption">{portfolio.warnings.map((w) => <div key={w}>{w}</div>)}</div>
            )}
          </>
        );
      }}
    </Ready>
  );
}
