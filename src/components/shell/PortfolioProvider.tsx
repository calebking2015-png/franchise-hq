"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Portfolio } from "@/lib/portfolio/types";
import type { PlayerMap, ProjectionMap, SleeperTrendingPlayer, StatsMap } from "@/lib/sleeper/types";
import type { ScheduleMap } from "@/lib/schedule";
import type { OddsMap } from "@/lib/odds";

const LS_USER = "fhq.username";
const LS_RECENT = "fhq.recent";
const LS_SOURCE = "fhq.projSource";
const REFRESH_MS = 3 * 60 * 1000;

export interface Trending { adds: SleeperTrendingPlayer[]; drops: SleeperTrendingPlayer[]; hours: number }
export type ProjSource = "sleeper" | "goldenboy" | "blend";
export interface GoldenBoy { projections: ProjectionMap & Record<string, { tdPct?: number }>; count: number; rows: number; unmatched: { name: string; team: string; pos: string }[]; source: string; url: string; error?: string; fetchedAt: string }
export interface Odds { configured: boolean; odds: OddsMap; note?: string }
export interface Projections { projections: ProjectionMap; season: string; week: number; source: string; fetchedAt: string }

interface Ctx {
  /** null until we've checked the browser for a saved username; "" means none saved (show onboarding). */
  username: string | null;
  setUsername: (u: string) => void;
  recentUsernames: string[];
  portfolio: Portfolio | null;
  players: PlayerMap;
  playersLoaded: boolean;
  trending: Trending | null;
  /** Active projections after the source toggle is applied (what every page uses). */
  projections: Projections | null;
  /** Raw feeds, for the Compare page. */
  sleeperProjections: Projections | null;
  goldenBoy: GoldenBoy | null;
  /** playerId → anytime-TD probability from Golden Boy, shown on eligible rows. */
  goldenBoyTd: Record<string, number>;
  projSource: ProjSource;
  setProjSource: (s: ProjSource) => void;
  schedule: ScheduleMap | null;
  liveStats: StatsMap | null;
  odds: Odds | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

const PortfolioContext = createContext<Ctx | null>(null);

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsernameState] = useState<string | null>(null);
  const [recentUsernames, setRecent] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<ScheduleMap | null>(null);
  const [liveStats, setLiveStats] = useState<StatsMap | null>(null);
  const [odds, setOdds] = useState<Odds | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [players, setPlayers] = useState<PlayerMap>({});
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [trending, setTrending] = useState<Trending | null>(null);
  const [sleeperProjections, setProjections] = useState<Projections | null>(null);
  const [goldenBoy, setGoldenBoy] = useState<GoldenBoy | null>(null);
  const [projSource, setProjSourceState] = useState<ProjSource>("sleeper");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(LS_USER) ?? "";
    setUsernameState(saved);
    try { setRecent(JSON.parse(window.localStorage.getItem(LS_RECENT) ?? "[]")); } catch { /* ignore */ }
    const src = window.localStorage.getItem(LS_SOURCE);
    if (src === "sleeper" || src === "goldenboy" || src === "blend") setProjSourceState(src);
    if (!saved) setLoading(false);
    mounted.current = true;
  }, []);

  const setProjSource = useCallback((v: ProjSource) => { window.localStorage.setItem(LS_SOURCE, v); setProjSourceState(v); }, []);

  const setUsername = useCallback((u: string) => {
    const v = u.trim();
    if (!v) return;
    window.localStorage.setItem(LS_USER, v);
    setRecent((prev) => {
      const next = [v, ...prev.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 6);
      window.localStorage.setItem(LS_RECENT, JSON.stringify(next));
      return next;
    });
    setUsernameState(v);
  }, []);

  const loadPortfolio = useCallback(async (u: string) => {
    setLoading(true);
    setError(null);
    try {
      const p = await getJson<Portfolio>(`/api/sleeper/portfolio?username=${encodeURIComponent(u)}`);
      setPortfolio(p);
      setLastUpdated(new Date());
      // Projections follow the portfolio's week so they always match what the lineups show.
      getJson<Projections>(`/api/sleeper/projections?season=${encodeURIComponent(p.season)}&week=${p.week}`)
        .then(setProjections)
        .catch(() => setProjections((prev) => prev));
      // Schedule carries live game status, so it refreshes on the same cadence as scores.
      getJson<{ schedule: ScheduleMap }>(`/api/sleeper/schedule?season=${encodeURIComponent(p.season)}`)
        .then((r) => setSchedule(r.schedule))
        .catch(() => setSchedule((prev) => prev));
      // Live stats feed: the matchup feed's per-player points lag several minutes behind this.
      getJson<{ stats: StatsMap }>(`/api/sleeper/stats?season=${encodeURIComponent(p.season)}&week=${p.week}`)
        .then((r) => setLiveStats(r.stats))
        .catch(() => setLiveStats((prev) => prev));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Players + trending load once (players are cached for hours by the browser).
  useEffect(() => {
    getJson<{ players: PlayerMap }>("/api/sleeper/players")
      .then((r) => { setPlayers(r.players); setPlayersLoaded(true); })
      .catch((e) => setError((prev) => prev ?? `Player database: ${(e as Error).message}`));
    getJson<Trending>("/api/sleeper/trending").then(setTrending).catch(() => setTrending({ adds: [], drops: [], hours: 24 }));
    getJson<Odds>("/api/odds").then(setOdds).catch(() => setOdds({ configured: false, odds: {} }));
    getJson<GoldenBoy>("/api/goldenboy").then(setGoldenBoy).catch(() => setGoldenBoy(null));
  }, []);

  useEffect(() => {
    if (!username) return; // null = not checked yet, "" = onboarding
    void loadPortfolio(username);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void loadPortfolio(username);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [username, loadPortfolio]);

  const refresh = useCallback(async () => {
    if (!username) return;
    await loadPortfolio(username);
    getJson<Trending>("/api/sleeper/trending").then(setTrending).catch(() => undefined);
  }, [username, loadPortfolio]);

  const merged = useMemo<PlayerMap>(
    () => (portfolio?.extraPlayers && Object.keys(portfolio.extraPlayers).length ? { ...players, ...portfolio.extraPlayers } : players),
    [players, portfolio?.extraPlayers],
  );

  // Apply the source toggle. Golden Boy has no K/DEF and a shorter player list, so Sleeper always backfills.
  const projections = useMemo<Projections | null>(() => {
    if (!sleeperProjections) return null;
    const gb = goldenBoy?.projections ?? {};
    if (projSource === "sleeper" || !Object.keys(gb).length) return sleeperProjections;
    const merged: ProjectionMap = { ...sleeperProjections.projections };
    for (const [id, g] of Object.entries(gb)) {
      const s = merged[id];
      if (projSource === "goldenboy" || !s) { merged[id] = { team: g.team ?? s?.team ?? null, opp: s?.opp ?? g.opp ?? null, gameId: s?.gameId ?? null, date: s?.date ?? null, stats: g.stats }; continue; }
      // Blend: average every stat both feeds have; keep the rest from whichever has it.
      const stats: Record<string, number> = { ...s.stats };
      for (const [k, v] of Object.entries(g.stats)) stats[k] = typeof s.stats[k] === "number" ? (s.stats[k] + v) / 2 : v;
      if (typeof g.stats.gb_qb_pts === "number") {
        // QB blend: average his headline with Sleeper's own scored points isn't possible here (league-specific),
        // so blend at the stat level and drop the override.
        delete stats.gb_qb_pts;
      }
      merged[id] = { ...s, stats };
    }
    return { ...sleeperProjections, projections: merged, source: projSource === "blend" ? "Sleeper + Golden Boy" : "Fantasy Golden Boy (Sleeper for K/DEF)" };
  }, [sleeperProjections, goldenBoy, projSource]);

  const goldenBoyTd = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const [id, g] of Object.entries(goldenBoy?.projections ?? {})) if (typeof (g as { tdPct?: number }).tdPct === "number") out[id] = (g as { tdPct?: number }).tdPct!;
    return out;
  }, [goldenBoy]);

  const value = useMemo<Ctx>(
    () => ({ username, setUsername, recentUsernames, portfolio, players: merged, playersLoaded, trending, projections, sleeperProjections, goldenBoy, goldenBoyTd, projSource, setProjSource, schedule, liveStats, odds, loading, error, refresh, lastUpdated }),
    [username, setUsername, recentUsernames, portfolio, merged, playersLoaded, trending, projections, sleeperProjections, goldenBoy, goldenBoyTd, projSource, setProjSource, schedule, liveStats, odds, loading, error, refresh, lastUpdated],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used inside PortfolioProvider");
  return ctx;
}
