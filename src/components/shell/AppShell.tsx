"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  LayoutDashboard, Trophy, ListChecks, Radar, PieChart, Users, Swords, Megaphone, Wand2, GitCompare, ArrowLeftRight, Crown, Settings, RefreshCw, Menu, X,
} from "lucide-react";
import { usePortfolio } from "./PortfolioProvider";
import { leagueAlerts, sortAlerts } from "@/lib/analysis/alerts";
import { cx } from "@/components/ui";

const NAV = [
  { href: "/", label: "Command Center", icon: LayoutDashboard, mobile: true },
  { href: "/leagues", label: "Leagues", icon: Trophy, mobile: true },
  { href: "/lineups", label: "Lineups", icon: ListChecks, mobile: true },
  { href: "/moves", label: "Moves", icon: Wand2, mobile: true },
  { href: "/waivers", label: "Waivers", icon: Radar, mobile: true },
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/players", label: "Players", icon: Users },
  { href: "/matchups", label: "Matchups", icon: Swords },
  { href: "/rooting", label: "Rooting", icon: Megaphone },
  { href: "/compare", label: "Compare", icon: GitCompare },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight },
  { href: "/dynasty", label: "Dynasty", icon: Crown, dynastyOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { portfolio, players, loading, refresh, lastUpdated, error, projSource, goldenBoy } = usePortfolio();
  const [menu, setMenu] = useState(false);

  const urgentCount = useMemo(() => {
    if (!portfolio) return 0;
    return sortAlerts(portfolio.leagues.flatMap((b) => leagueAlerts(b, players))).filter((a) => a.severity === "urgent").length;
  }, [portfolio, players]);

  const hasDynasty = portfolio?.leagues.some((l) => l.format.isDynasty) ?? true;
  const nav = NAV.filter((n) => !n.dynastyOnly || hasDynasty);
  const week = portfolio ? `Week ${portfolio.week}` : "";

  const Brand = (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="grid place-items-center w-8 h-8 rounded-md bg-gold text-gold-ink display text-[17px]">HQ</span>
      <span className="display text-[20px] tracking-tight">Franchise HQ</span>
    </Link>
  );

  const NavList = ({ onNav }: { onNav?: () => void }) => (
    <nav className="flex flex-col gap-0.5">
      {nav.map((n) => {
        const active = isActive(path, n.href);
        return (
          <Link key={n.href} href={n.href} onClick={onNav} aria-current={active ? "page" : undefined}
            className={cx("flex items-center gap-3 px-3 py-2 rounded-md text-[14.5px]", active ? "bg-surface-3 text-ink font-medium" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
            <n.icon size={17} className={active ? "text-gold" : "text-muted"} />
            <span className="flex-1">{n.label}</span>
            {n.href === "/" && urgentCount > 0 && <span className="chip bg-urgent text-white num" style={{ fontSize: 11 }}>{urgentCount}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col gap-6 sticky top-0 h-dvh px-3 py-4 border-r border-line bg-surface">
        {Brand}
        <NavList />
        <div className="mt-auto px-2 text-[12px] text-faint">
          {portfolio && <div>{portfolio.user.display_name} · {portfolio.season} · {week}</div>}
          <div className="mt-0.5">Sleeper read-only · analysis only</div>
        </div>
      </aside>

      <div className="min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 lg:px-6 min-h-14 pt-[env(safe-area-inset-top)] border-b border-line bg-bg/90 backdrop-blur">
          <div className="lg:hidden">{Brand}</div>
          <div className="hidden lg:flex items-center gap-2 text-[13px] text-muted">
            {portfolio && (<>
              <span className="chip chip-solid">{portfolio.season}</span>
              <span className="chip chip-solid">{week}</span>
              <span>{portfolio.leagues.length} leagues</span>
            </>)}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {error && <span className="hidden md:inline text-[12.5px] text-urgent max-w-[38ch] truncate" title={error}>{error}</span>}
            {projSource !== "sleeper" && goldenBoy?.count ? <Link href="/settings" className="chip bg-gold/15 text-gold text-[11.5px] hover:bg-gold/25" title="Projection source — change in Settings">{projSource === "blend" ? "Blend" : "Golden Boy"}</Link> : null}
            <button type="button" className="btn text-[13px]" onClick={() => void refresh()} disabled={loading} aria-label="Refresh data">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{loading ? "Refreshing" : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Refresh"}</span>
            </button>
            <button type="button" className="btn lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={16} /></button>
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-6 py-5 pb-24 lg:pb-8 max-w-[1440px] w-full mx-auto">{children}</main>

        {/* Mobile bottom tabs */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 grid grid-cols-6 border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          {nav.filter((n) => n.mobile).map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link key={n.href} href={n.href} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-gold" : "text-muted")}>
                <n.icon size={20} />
                <span>{n.label === "Command Center" ? "Home" : n.label}</span>
                {n.href === "/" && urgentCount > 0 && <span className="absolute top-1 right-[22%] w-2 h-2 rounded-full bg-urgent" />}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMenu(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted"><Menu size={20} /><span>More</span></button>
        </nav>

        {menu && (
          <div className="lg:hidden fixed inset-0 z-30 bg-bg/70" onClick={() => setMenu(false)}>
            <div className="absolute right-0 top-0 h-full w-72 bg-surface border-l border-line p-4 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">{Brand}<button type="button" className="btn" onClick={() => setMenu(false)} aria-label="Close menu"><X size={16} /></button></div>
              <NavList onNav={() => setMenu(false)} />
              <button type="button" className="btn justify-center text-[14px]" onClick={() => { void refresh(); setMenu(false); }} disabled={loading}>
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                {loading ? "Refreshing…" : lastUpdated ? `Refresh · updated ${lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Refresh"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
