"use client";

import { useState } from "react";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { Card, PageHeader, cx } from "@/components/ui";

export default function SettingsPage() {
  const { username, setUsername, portfolio, refresh, loading, lastUpdated } = usePortfolio();
  const [draft, setDraft] = useState(username);
  const prov = portfolio?.providers;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Sleeper account">
          <label className="caption block mb-1.5" htmlFor="u">Sleeper username</label>
          <div className="flex gap-2">
            <input id="u" className="field flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setUsername(draft)} autoCapitalize="none" autoCorrect="off" />
            <button type="button" className="btn btn-gold" onClick={() => setUsername(draft)} disabled={!draft.trim() || draft.trim() === username}>Load</button>
          </div>
          <p className="caption mt-2">Read-only. Franchise HQ never changes lineups, waivers or trades — make moves in the Sleeper app.</p>
          {portfolio && <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 text-[13.5px]"><dt className="text-muted">Display name</dt><dd>{portfolio.user.display_name}</dd><dt className="text-muted">User id</dt><dd className="num">{portfolio.user.user_id}</dd><dt className="text-muted">Season</dt><dd className="num">{portfolio.season} · week {portfolio.week}</dd><dt className="text-muted">Leagues</dt><dd className="num">{portfolio.leagues.length}</dd></dl>}
        </Card>

        <Card title="Data & refresh">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[13.5px]">Leagues, rosters and matchups refresh every 3 minutes while the tab is visible.</div><div className="caption">Last updated {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}. Player database is cached for 24h on the server.</div></div>
            <button type="button" className="btn" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing…" : "Refresh now"}</button>
          </div>
        </Card>

        <Card title="Data providers" className="lg:col-span-2" pad={false}>
          <table className="data"><thead><tr><th>Provider</th><th>Status</th><th>Unlocks</th></tr></thead><tbody>
            {[
              ["Sleeper", prov?.sleeper, "Leagues, rosters, matchups, injury flags, trending adds"],
              ["Projections", prov?.projection, "Start/sit, lineup optimizer, projected margins, FAAB guidance"],
              ["Rankings", prov?.ranking, "Waiver add/drop recommendations, drop candidates"],
              ["Schedule", prov?.schedule, "Bye weeks, kickoff times, lineup-lock warnings, Sunday Mode ordering"],
              ["Dynasty values", prov?.dynastyValue, "Contender/rebuilder classification, trade analyzer"],
              ["News", prov?.news, "Player news on player pages"],
              ["Betting", prov?.betting, "Game environment signals for start/sit"],
            ].map(([name, p, unlocks]) => (
              <tr key={name as string}><td className="font-medium">{name as string}</td><td><span className={cx("chip", (p as { configured?: boolean })?.configured ? "bg-ok/15 text-ok" : "bg-surface-3 text-muted")}>{(p as { configured?: boolean })?.configured ? "Connected" : "Not configured"}</span></td><td className="caption">{unlocks as string}</td></tr>
            ))}
          </tbody></table>
          <p className="caption px-4 py-3 border-t border-line">Providers are pluggable interfaces in <code className="num">src/lib/providers</code>. Anything not connected renders as "not configured" rather than a made-up number.</p>
        </Card>
      </div>
    </>
  );
}
