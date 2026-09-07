"use client";

import { useState } from "react";
import { Ready, LeagueCard } from "@/components/fantasy";
import { PageHeader, Segmented } from "@/components/ui";
import { leagueAlerts } from "@/lib/analysis/alerts";

type Filter = "all" | "redraft" | "dynasty";

export default function LeaguesPage() {
  const [filter, setFilter] = useState<Filter>("all");
  return (
    <Ready>
      {(portfolio, players) => {
        const list = portfolio.leagues.filter((b) => filter === "all" || b.format.kind === filter || (filter === "redraft" && b.format.kind === "keeper"));
        return (
          <>
            <PageHeader title="Leagues" sub={`${portfolio.leagues.length} Sleeper leagues · ${portfolio.season}`}
              actions={<Segmented value={filter} onChange={setFilter} options={[
                { value: "all", label: "All", count: portfolio.leagues.length },
                { value: "redraft", label: "Redraft", count: portfolio.leagues.filter((b) => !b.format.isDynasty).length },
                { value: "dynasty", label: "Dynasty", count: portfolio.leagues.filter((b) => b.format.isDynasty).length },
              ]} />} />
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {list.map((b) => <LeagueCard key={b.league.league_id} b={b} alertCount={leagueAlerts(b, players).filter((a) => a.severity !== "info").length} />)}
            </div>
          </>
        );
      }}
    </Ready>
  );
}
