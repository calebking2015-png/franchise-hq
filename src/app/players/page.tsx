"use client";

import { useState } from "react";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, PageHeader, PlayerCell, SearchInput, Segmented, cx } from "@/components/ui";
import { exposureFor } from "@/lib/analysis/exposure";
import type { PlayerMap } from "@/lib/sleeper/types";

type Pos = "ALL" | "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
type Scope = "all" | "mine";

function search(players: PlayerMap, q: string, pos: Pos, ids: Set<string> | null, limit = 60) {
  const needle = q.trim().toLowerCase();
  const out = [];
  for (const p of Object.values(players)) {
    if (pos !== "ALL" && p.pos !== pos) continue;
    if (ids && !ids.has(p.id)) continue;
    if (needle && !p.name.toLowerCase().includes(needle) && p.team?.toLowerCase() !== needle) continue;
    out.push(p);
  }
  // Sleeper's search_rank orders players roughly by relevance; lower is better.
  out.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name));
  return out.slice(0, limit);
}

export default function PlayersPage() {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<Pos>("ALL");
  const [scope, setScope] = useState<Scope>("mine");

  return (
    <Ready>
      {(portfolio, players) => {
        const mine = new Set<string>();
        for (const b of portfolio.leagues) for (const id of b.myRoster?.players ?? []) mine.add(id);
        const results = search(players, q, pos, scope === "mine" ? mine : null);
        return (
          <>
            <PageHeader title="Players" sub="Search any NFL player and see where you own him, where he's available, and who has him." />
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <SearchInput value={q} onChange={setQ} placeholder="Search by name or team abbreviation" className="w-full sm:w-72" />
              <Segmented value={scope} onChange={setScope} options={[{ value: "mine", label: "My players", count: mine.size }, { value: "all", label: "All NFL" }]} />
              <Segmented value={pos} onChange={setPos} options={(["ALL", "QB", "RB", "WR", "TE", "K", "DEF"] as Pos[]).map((v) => ({ value: v, label: v === "DEF" ? "DST" : v === "ALL" ? "All" : v }))} />
            </div>
            {results.length === 0 ? <EmptyState title="No players found" detail="Try a shorter name or switch to All NFL." /> : (
              <Card pad={false}><table className="data">
                <thead><tr><th>Player</th><th className="r">Age</th><th className="r">Owned</th><th className="r">Available</th></tr></thead>
                <tbody>{results.map((p) => { const e = exposureFor(p.id, portfolio); return (
                  <tr key={p.id}><td><PlayerCell player={p} /></td><td className="r num text-muted">{p.age ?? "—"}</td><td className={cx("r num font-semibold", e.shares ? "text-gold" : "text-faint")}>{e.shares}<span className="text-muted text-[12px] font-normal">/{e.total}</span></td><td className="r num text-ok">{e.leagues.filter((l) => l.state === "available").length}</td></tr>
                ); })}</tbody>
              </table></Card>
            )}
          </>
        );
      }}
    </Ready>
  );
}

