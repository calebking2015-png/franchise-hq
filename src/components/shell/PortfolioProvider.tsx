"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Portfolio } from "@/lib/portfolio/types";
import type { PlayerMap, ProjectionMap, SleeperTrendingPlayer, StatsMap } from "@/lib/sleeper/types";
import type { ScheduleMap } from "@/lib/schedule";
import type { OddsMap } from "@/lib/odds";

const LS_USER = "fhq.username";
const LS_RECENT = "fhq.recent";
const REFRESH_MS = 3 * 60 * 1000;

export interface Trending { adds: SleeperTrendingPlayer[]; drops: SleeperTrendingPlayer[]; hours: number }
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
  projections: Projections | null;
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
  const [projections, setProjections] = useState<Projections | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(LS_USER) ?? "";
    setUsernameState(saved);
    try { setRecent(JSON.parse(window.localStorage.getItem(LS_RECENT) ?? "[]")); } catch { /* ignore */ }
    if (!saved) setLoading(false);
    mounted.current = true;
  }, []);

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

  const value = useMemo<Ctx>(
    () => ({ username, setUsername, recentUsernames, portfolio, players: merged, playersLoaded, trending, projections, schedule, liveStats, odds, loading, error, refresh, lastUpdated }),
    [username, setUsername, recentUsernames, portfolio, merged, playersLoaded, trending, projections, schedule, liveStats, odds, loading, error, refresh, lastUpdated],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used inside PortfolioProvider");
  return ctx;
}
