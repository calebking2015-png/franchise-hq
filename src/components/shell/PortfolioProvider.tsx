"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Portfolio } from "@/lib/portfolio/types";
import type { PlayerMap, ProjectionMap, SleeperTrendingPlayer } from "@/lib/sleeper/types";

const DEFAULT_USERNAME = process.env.NEXT_PUBLIC_DEFAULT_USERNAME ?? "Poppysavage";
const LS_USER = "fhq.username";
const REFRESH_MS = 3 * 60 * 1000;

export interface Trending { adds: SleeperTrendingPlayer[]; drops: SleeperTrendingPlayer[]; hours: number }
export interface Projections { projections: ProjectionMap; season: string; week: number; source: string; fetchedAt: string }

interface Ctx {
  username: string;
  setUsername: (u: string) => void;
  portfolio: Portfolio | null;
  players: PlayerMap;
  playersLoaded: boolean;
  trending: Trending | null;
  projections: Projections | null;
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
  const [username, setUsernameState] = useState(DEFAULT_USERNAME);
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
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(LS_USER) : null;
    if (saved) setUsernameState(saved);
    mounted.current = true;
  }, []);

  const setUsername = useCallback((u: string) => {
    const v = u.trim();
    if (!v) return;
    window.localStorage.setItem(LS_USER, v);
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
  }, []);

  useEffect(() => {
    void loadPortfolio(username);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void loadPortfolio(username);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [username, loadPortfolio]);

  const refresh = useCallback(async () => {
    await loadPortfolio(username);
    getJson<Trending>("/api/sleeper/trending").then(setTrending).catch(() => undefined);
  }, [username, loadPortfolio]);

  const merged = useMemo<PlayerMap>(
    () => (portfolio?.extraPlayers && Object.keys(portfolio.extraPlayers).length ? { ...players, ...portfolio.extraPlayers } : players),
    [players, portfolio?.extraPlayers],
  );

  const value = useMemo<Ctx>(
    () => ({ username, setUsername, portfolio, players: merged, playersLoaded, trending, projections, loading, error, refresh, lastUpdated }),
    [username, setUsername, portfolio, merged, playersLoaded, trending, projections, loading, error, refresh, lastUpdated],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used inside PortfolioProvider");
  return ctx;
}
