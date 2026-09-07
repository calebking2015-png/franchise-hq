"use client";

import { Ready } from "@/components/fantasy";
import { Card, PageHeader, PositionBadge } from "@/components/ui";
import { positionalDepth } from "@/lib/analysis/exposure";

/**
 * Phase 3 surface. Today it shows the honest inputs a trade engine will use
 * (league format + your positional depth) and nothing invented.
 */
export default function TradesPage() {
  return (
    <Ready>
      {(portfolio, players) => (
        <>
          <PageHeader title="Trades" sub="Trade analyzer and trade finder land in Phase 3. No player values are shown until a value provider is configured — nothing here is fabricated." />
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {portfolio.leagues.map((b) => (
              <Card key={b.league.league_id} title={b.league.name} actions={<span className="caption">{b.format.isDynasty ? "Dynasty" : "Redraft"} · {b.format.superflex ? "SF" : "1QB"} · {b.format.scoring}{b.format.tePremium ? " · TEP" : ""}</span>}>
                <div className="grid gap-1.5 text-[13.5px]">
                  {["QB", "RB", "WR", "TE"].map((pos) => {
                    const d = positionalDepth(b, players, pos);
                    const need = d.starterSlots + d.flexSlots;
                    const thin = d.healthy <= d.starterSlots;
                    return <div key={pos} className="flex items-center justify-between"><span className="flex items-center gap-2"><PositionBadge pos={pos} /><span className="text-muted">{d.starterSlots} start{d.flexSlots ? `, ${d.flexSlots} flex-eligible` : ""}</span></span><span className={thin && need ? "text-warn num" : "num"}>{d.healthy} healthy<span className="text-muted"> / {d.total}</span></span></div>;
                  })}
                </div>
                <p className="caption mt-3">{b.format.tradeDeadline ? `Trade deadline week ${b.format.tradeDeadline}.` : "No trade deadline set."} Depth is counted from Sleeper rosters and injury flags.</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </Ready>
  );
}
