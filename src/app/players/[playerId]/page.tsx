"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, Headshot, PageHeader, PositionBadge, StatTile, StatusBadge, TeamLogo, Unavailable, cx } from "@/components/ui";
import { exposureFor } from "@/lib/analysis/exposure";
import { slotLabel, startingSlots } from "@/lib/league/format";

const GROUP = { mine: "Owned by you", available: "Available", other: "Owned by someone else", opponent: "Owned by this week's opponent" } as const;
const GROUP_CLASS = { mine: "border-gold", available: "border-ok", opponent: "border-warn", other: "border-line-2" } as const;

export default function PlayerPage() {
  const { playerId } = useParams<{ playerId: string }>();
  return (
    <Ready>
      {(portfolio, players) => {
        const p = players[playerId];
        if (!p) return <EmptyState title="Player not found" detail={`Sleeper id ${playerId} isn't in the trimmed player database (retired, inactive, or non-fantasy position).`} action={<Link href="/players" className="btn">Back to players</Link>} />;
        const e = exposureFor(p.id, portfolio);
        const groups = (["mine", "opponent", "available", "other"] as const).map((g) => ({ g, list: e.leagues.filter((l) => l.state === g) })).filter((x) => x.list.length);

        return (
          <>
            <div className="mb-1"><Link href="/players" className="caption hover:text-gold">← Players</Link></div>
            <div className="flex items-start gap-4 mb-5">
              <Headshot player={p} size={72} />
              <div className="min-w-0">
                <PageHeader title={p.name} sub={<span className="flex flex-wrap items-center gap-2"><PositionBadge pos={p.pos} /><span className="flex items-center gap-1"><TeamLogo team={p.team} size={16} />{p.team ?? "Free agent"}</span>{p.number != null && <span className="num">#{p.number}</span>}{p.age != null && <span>Age {p.age}</span>}{p.exp != null && <span>{p.exp === 0 ? "Rookie" : `Year ${p.exp + 1}`}</span>}<StatusBadge player={p} full />{p.injuryPart && <span className="text-muted">({p.injuryPart})</span>}</span>} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <StatTile label="Your exposure" value={<>{e.shares}<span className="text-muted text-[18px]">/{e.total}</span></>} sub={`${e.pct}% of leagues · starting in ${e.startingShares}`} tone={e.shares ? "gold" : "muted"} />
              <StatTile label="Available in" value={e.leagues.filter((l) => l.state === "available").length} tone="ok" sub="leagues on waivers / FA" />
              <StatTile label="Bye week" value={<Unavailable what="—" />} sub="Schedule provider not configured" tone="muted" />
              <StatTile label="Weekly projection" value={<Unavailable what="—" />} sub="Projection provider not configured" tone="muted" />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card title="League by league" pad={false}>
                <div className="divide-y divide-line">
                  {groups.map(({ g, list }) => (
                    <div key={g} className={cx("px-4 py-3 border-l-[3px]", GROUP_CLASS[g])}>
                      <div className="h3 mb-1.5">{GROUP[g]} <span className="text-muted num font-normal">· {list.length}</span></div>
                      <div className="grid gap-1 text-[13.5px]">
                        {list.map((l) => {
                          const b = portfolio.leagues.find((x) => x.league.league_id === l.leagueId)!;
                          const idx = b.myRoster?.starters?.indexOf(p.id) ?? -1;
                          const slot = idx >= 0 ? startingSlots(b.league)[idx] : null;
                          const onIr = b.myRoster?.reserve?.includes(p.id);
                          const onTaxi = b.myRoster?.taxi?.includes(p.id);
                          return (
                            <div key={l.leagueId} className="flex items-center justify-between gap-2">
                              <Link href={`/leagues/${l.leagueId}`} className="hover:text-gold truncate">{l.leagueName}</Link>
                              <span className="caption shrink-0 flex items-center gap-1.5">{l.isDynasty && <span className="chip chip-outline text-gold">Dynasty</span>}{g === "mine" && (slot ? <span className="chip chip-solid num">{slotLabel(slot)}</span> : onIr ? <span className="chip chip-solid">IR</span> : onTaxi ? <span className="chip chip-solid">Taxi</span> : <span className="chip chip-solid">Bench</span>)}{l.ownerTeam && <span>{l.ownerTeam}</span>}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <div className="grid gap-4 content-start">
                <Card title="Player details">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13.5px]">
                    <dt className="text-muted">Status</dt><dd>{p.status ?? "—"}</dd>
                    <dt className="text-muted">Injury</dt><dd>{p.injury ? `${p.injury}${p.injuryPart ? ` (${p.injuryPart})` : ""}` : "None listed"}</dd>
                    <dt className="text-muted">Depth chart</dt><dd className="num">{p.depth != null ? `${p.pos}${p.depth}` : "—"}</dd>
                    <dt className="text-muted">Sleeper rank</dt><dd className="num">{p.rank != null && p.rank < 9_000_000 ? p.rank : "—"}</dd>
                  </dl>
                  <p className="caption mt-3">Source: Sleeper player feed. Sleeper rank is Sleeper's own search ordering, not a projection.</p>
                </Card>
                <Card title="Coming with data providers">
                  <ul className="caption grid gap-1">
                    <li>Rest-of-season ranking and dynasty value — <Unavailable what="not configured" /></li>
                    <li>Targets, carries, snap share, routes — <Unavailable what="not configured" /></li>
                    <li>News and upcoming schedule — <Unavailable what="not configured" /></li>
                    <li>Start/sit and trade recommendations — need the above</li>
                  </ul>
                </Card>
              </div>
            </div>
          </>
        );
      }}
    </Ready>
  );
}
