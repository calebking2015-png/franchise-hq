"use client";

import Link from "next/link";
import { useState } from "react";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { Ready } from "@/components/fantasy";
import { Card, cx, EmptyState, Expandable, PageHeader, PlayerCell, PositionBadge, SearchInput, Segmented, StatusBadge, TeamLogo, PlayerLink } from "@/components/ui";
import { waiverRadar, positionalDepth, type WaiverCandidate } from "@/lib/analysis/exposure";
import type { Portfolio } from "@/lib/portfolio/types";
import type { PlayerMap } from "@/lib/sleeper/types";

type PosFilter = "ALL" | "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
type Avail = "any" | "available";

const STATE_LABEL = { mine: "Owned by you", available: "Available", other: "Owned by", opponent: "Owned by this week's opponent" } as const;
const STATE_CLASS = { mine: "text-gold", available: "text-ok", other: "text-muted", opponent: "text-warn" } as const;

function Candidate({ c, players, portfolio }: { c: WaiverCandidate; players: PlayerMap; portfolio: Portfolio }) {
  const p = players[c.playerId];
  return (
    <Expandable className="px-4 py-3" summary={
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0"><PlayerCell player={p} /></div>
        <div className="text-right shrink-0">
          <div className="num text-[18px] font-semibold"><span className={c.availableIn.length ? "text-ok" : "text-muted"}>{c.availableIn.length}</span><span className="text-muted text-[14px]"> / {portfolio.leagues.length}</span></div>
          <div className="caption">available</div>
        </div>
        <div className="text-right shrink-0 w-20 hidden sm:block">
          <div className="num text-[16px] font-medium text-ok">+{c.adds.toLocaleString()}</div>
          <div className="caption">adds · 24h</div>
        </div>
      </div>}>
      <div className="grid gap-1.5">
        {c.ownership.map((o) => {
          const b = portfolio.leagues.find((x) => x.league.league_id === o.leagueId)!;
          const d = positionalDepth(b, players, p.pos);
          return (
            <div key={o.leagueId} className="flex items-center justify-between gap-3 text-[13.5px] py-1 border-b border-line last:border-b-0">
              <Link href={`/leagues/${o.leagueId}`} className="truncate hover:text-gold">{o.leagueName}</Link>
              <span className="flex items-center gap-3 shrink-0">
                {o.state === "available" && <span className="caption hidden sm:inline">You have {d.healthy}/{d.total} healthy {p.pos === "DEF" ? "DST" : p.pos}{d.starterSlots ? ` for ${d.starterSlots} slot${d.starterSlots > 1 ? "s" : ""}` : ""}</span>}
                <span className={cx("font-medium", STATE_CLASS[o.state])}>{o.state === "other" ? `Owned by ${o.ownerTeam}` : STATE_LABEL[o.state]}</span>
              </span>
            </div>
          );
        })}
        {c.drops > 0 && <div className="caption pt-1">Also being dropped: {c.drops.toLocaleString()} drops in the same window.</div>}
      </div>
    </Expandable>
  );
}

export default function WaiversPage() {
  const { trending } = usePortfolio();
  const [pos, setPos] = useState<PosFilter>("ALL");
  const [avail, setAvail] = useState<Avail>("available");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"adds" | "drops">("adds");

  return (
    <Ready>
      {(portfolio, players) => {
        const radar = waiverRadar(portfolio, players, trending?.adds ?? [], trending?.drops ?? []);
        const filtered = radar.filter((c) => {
          const p = players[c.playerId];
          if (pos !== "ALL" && p.pos !== pos) return false;
          if (avail === "available" && c.availableIn.length === 0) return false;
          if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
          return true;
        });
        const myDrops = (trending?.drops ?? []).map((d) => ({ d, mine: portfolio.leagues.filter((b) => b.ownership[d.player_id] === b.myRosterId) })).filter((x) => x.mine.length && players[x.d.player_id]);

        return (
          <>
            <PageHeader title="Waivers" sub="Sleeper's trending adds across the last 24 hours, crossed with availability in every one of your leagues." />
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Segmented value={tab} onChange={setTab} options={[{ value: "adds", label: "Trending adds", count: radar.length }, { value: "drops", label: "Drops you own", count: myDrops.length }]} />
              {tab === "adds" && <>
                <Segmented value={pos} onChange={setPos} options={(["ALL", "QB", "RB", "WR", "TE", "K", "DEF"] as PosFilter[]).map((v) => ({ value: v, label: v === "DEF" ? "DST" : v === "ALL" ? "All" : v }))} />
                <Segmented value={avail} onChange={setAvail} options={[{ value: "available", label: "Available somewhere" }, { value: "any", label: "Everyone trending" }]} />
                <SearchInput value={q} onChange={setQ} className="w-full sm:w-56" />
              </>}
            </div>

            {tab === "adds" && (
              !trending ? <div className="caption">Loading trending data…</div> :
              filtered.length === 0 ? <EmptyState title="Nothing matches" detail="Widen the position filter or include players already rostered." /> : (
                <Card pad={false}><div className="divide-y divide-line">{filtered.map((c) => <Candidate key={c.playerId} c={c} players={players} portfolio={portfolio} />)}</div>
                  <div className="px-4 py-2.5 caption border-t border-line">Add / drop / FAAB recommendations need a ranking or projection provider. Until one is configured this page shows Sleeper trend × availability × your positional depth, and nothing invented.</div>
                </Card>
              )
            )}

            {tab === "drops" && (
              myDrops.length === 0 ? <EmptyState title="None of your players are trending drops" detail="Good sign — nobody on your rosters is being cut league-wide right now." /> : (
                <Card pad={false} title="Players you own that Sleeper users are dropping">
                  <div className="divide-y divide-line">{myDrops.map(({ d, mine }) => { const p = players[d.player_id]; return (
                    <div key={d.player_id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0 flex items-center gap-2"><PositionBadge pos={p.pos} /><PlayerLink player={p} className="font-medium" /><TeamLogo team={p.team} size={14} /><span className="text-muted text-[12.5px]">{p.team ?? "FA"}</span><StatusBadge player={p} /></div>
                      <div className="text-right"><div className="num text-urgent font-medium">−{d.count.toLocaleString()}</div><div className="caption">{mine.length} of your leagues</div></div>
                    </div>
                  ); })}</div>
                </Card>
              )
            )}
          </>
        );
      }}
    </Ready>
  );
}

