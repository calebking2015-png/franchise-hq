"use client";

import { useEffect, useState } from "react";
import { usePortfolio } from "@/components/shell/PortfolioProvider";
import { Ready } from "@/components/fantasy";
import { Card, EmptyState, PageHeader, Segmented, cx } from "@/components/ui";
import type { SeasonRecap, WeekRecap } from "@/lib/analysis/recap";

async function getJson<T>(url: string): Promise<T> { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

function SeasonCard({ s }: { s: SeasonRecap }) {
  return (
    <Card pad={false} title={<span className="flex items-center gap-2">{s.season}{s.champion && <span className="chip bg-gold/15 text-gold text-[11px]">🏆 {s.champion.name}</span>}</span>} actions={<span className="caption">{s.complete ? "Final" : "In progress"}</span>}>
      <div className="p-4">
        {s.narrative.map((line, i) => <p key={i} className={cx("text-[14px] leading-relaxed", i === 0 ? "font-medium" : "text-muted mt-1.5")}>{line}</p>)}
      </div>
      <div className="border-t border-line">
        <table className="tbl">
          <thead><tr><th>#</th><th>Team</th><th className="r">Record</th><th className="r">PF</th><th className="r hidden sm:table-cell">PA</th></tr></thead>
          <tbody>
            {s.teams.slice(0, 6).map((t) => (
              <tr key={t.rosterId} className={cx(t.isChampion && "bg-gold/5")}>
                <td className="num text-muted">{t.standing}</td>
                <td><span className={cx("font-medium", t.isChampion && "text-gold")}>{t.name}</span>{t.isChampion && " 🏆"}{t.isRunnerUp && <span className="text-muted"> (runner-up)</span>}<div className="caption">{t.owner}</div></td>
                <td className="r num">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ""}</td>
                <td className="r num">{t.pointsFor.toFixed(0)}</td>
                <td className="r num hidden sm:table-cell text-muted">{t.pointsAgainst.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function RecapsPage() {
  const { portfolio } = usePortfolio();
  const dynasty = portfolio?.leagues.filter((b) => b.format.isDynasty) ?? [];
  const [leagueId, setLeagueId] = useState("");
  const [mode, setMode] = useState<"history" | "week">("history");
  const [seasons, setSeasons] = useState<SeasonRecap[] | null>(null);
  const [week, setWeek] = useState<number>(portfolio?.week ?? 1);
  const [weekRecap, setWeekRecap] = useState<WeekRecap | null>(null);
  const [loading, setLoading] = useState(false);

  const chosen = leagueId || dynasty[0]?.league.league_id || portfolio?.leagues[0]?.league.league_id || "";

  useEffect(() => {
    if (!chosen || mode !== "history") return;
    setLoading(true); setSeasons(null);
    getJson<{ seasons: SeasonRecap[] }>(`/api/sleeper/history?leagueId=${chosen}`).then((r) => setSeasons(r.seasons)).catch(() => setSeasons([])).finally(() => setLoading(false));
  }, [chosen, mode]);

  useEffect(() => {
    if (!chosen || mode !== "week") return;
    setLoading(true); setWeekRecap(null);
    getJson<{ recap: WeekRecap | null }>(`/api/sleeper/weekrecap?leagueId=${chosen}&week=${week}`).then((r) => setWeekRecap(r.recap)).catch(() => setWeekRecap(null)).finally(() => setLoading(false));
  }, [chosen, week, mode]);

  return (
    <Ready>
      {(p) => {
        const leagues = p.leagues;
        const id = leagueId || dynasty[0]?.league.league_id || leagues[0].league.league_id;
        return (
          <>
            <PageHeader title="Recaps" sub="Season-by-season history and weekly writeups, generated from your league's own records on Sleeper — verified scores, standings and champions, phrased into a readable recap."
              actions={<div className="flex flex-wrap gap-2">
                <select value={id} onChange={(e) => setLeagueId(e.target.value)} className="field text-[13px] py-1.5">{leagues.map((b) => <option key={b.league.league_id} value={b.league.league_id}>{b.league.name}{b.format.isDynasty ? " (dynasty)" : ""}</option>)}</select>
                <Segmented value={mode} onChange={setMode} options={[{ value: "history", label: "Season history" }, { value: "week", label: "This week" }]} />
              </div>} />

            {mode === "week" && (
              <div className="flex items-center gap-2 mb-4">
                <span className="caption">Week</span>
                <select value={week} onChange={(e) => setWeek(Number(e.target.value))} className="field text-[13px] py-1.5">{Array.from({ length: p.week }, (_, i) => i + 1).reverse().map((w) => <option key={w} value={w}>{w}</option>)}</select>
              </div>
            )}

            {loading && <div className="caption">Pulling league records…</div>}

            {mode === "history" && !loading && (
              seasons && seasons.length ? <div className="grid gap-4">{seasons.map((s) => <SeasonCard key={s.leagueId} s={s} />)}</div>
                : <EmptyState title="No history found" detail="Sleeper didn't return prior seasons for this league — it may be its first year, or an older season's data is unavailable." />
            )}

            {mode === "week" && !loading && (
              weekRecap ? (
                <div className="grid gap-4">
                  <Card title={`Week ${weekRecap.week}`} pad={false}>
                    <div className="p-4">{weekRecap.narrative.map((line, i) => <p key={i} className={cx("text-[14px] leading-relaxed", i === 0 ? "font-medium" : "text-muted mt-1.5")}>{line}</p>)}</div>
                    <div className="border-t border-line divide-y divide-line">
                      {weekRecap.results.map((r, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2.5 text-[13.5px]">
                          <span className={cx("flex-1 truncate", r.b && r.a.points >= r.b.points ? "font-medium" : "")}>{r.a.name} <span className="num">{r.a.points.toFixed(1)}</span></span>
                          <span className="text-muted px-2">def.</span>
                          <span className="flex-1 truncate text-right text-muted">{r.b ? <>{r.b.name} <span className="num">{r.b.points.toFixed(1)}</span></> : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              ) : <EmptyState title="No results for that week" detail="That week hasn't been played yet, or Sleeper has no matchups for it." />
            )}
          </>
        );
      }}
    </Ready>
  );
}
