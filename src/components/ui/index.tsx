"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cdn } from "@/lib/sleeper/client";
import type { Player } from "@/lib/sleeper/types";
import type { DataSource } from "@/lib/providers";
import { statusLabel } from "@/lib/analysis/alerts";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

/* ---------- Badges ---------- */

export function PositionBadge({ pos, className }: { pos: string; className?: string }) {
  return (
    <span className={cx("chip pos-badge num font-semibold", `pos-${pos}`, className)} style={{ fontSize: 12 }}>
      {pos === "DEF" ? "DST" : pos}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  Out: "bg-urgent/15 text-urgent border-urgent/40",
  IR: "bg-urgent/15 text-urgent border-urgent/40",
  PUP: "bg-urgent/15 text-urgent border-urgent/40",
  Sus: "bg-urgent/15 text-urgent border-urgent/40",
  COV: "bg-urgent/15 text-urgent border-urgent/40",
  NA: "bg-urgent/15 text-urgent border-urgent/40",
  DNR: "bg-urgent/15 text-urgent border-urgent/40",
  Doubtful: "bg-warn/15 text-warn border-warn/40",
  Questionable: "bg-caution/15 text-caution border-caution/40",
  FA: "bg-surface-3 text-muted border-line-2",
};
const STATUS_SHORT: Record<string, string> = { Questionable: "Q", Doubtful: "D", Out: "OUT", IR: "IR", PUP: "PUP", Sus: "SUS", COV: "COV", NA: "NA", DNR: "DNR", FA: "FA" };

export function StatusBadge({ player, full = false }: { player: Player | undefined; full?: boolean }) {
  const s = statusLabel(player);
  if (!s) return null;
  return (
    <span className={cx("chip border font-semibold", STATUS_STYLE[s] ?? "bg-surface-3 text-muted border-line-2")} title={player?.injuryPart ?? s}>
      {full ? s : STATUS_SHORT[s] ?? s}
    </span>
  );
}

export function SourceTag({ source, note }: { source: DataSource; note?: string }) {
  const label: Record<DataSource, string> = {
    sleeper: "Sleeper", "third-party": "Third-party", calculated: "Calculated", ai: "AI", unavailable: "Unavailable",
  };
  return (
    <span className="chip chip-outline text-faint" title={note}>
      {label[source]}
    </span>
  );
}

export function LeagueKindChip({ kind }: { kind: "redraft" | "dynasty" | "keeper" }) {
  const cls = kind === "dynasty" ? "border-gold/50 text-gold bg-gold/10" : kind === "keeper" ? "border-info/50 text-info bg-info/10" : "border-line-2 text-ink-2";
  return <span className={cx("chip border capitalize", cls)}>{kind}</span>;
}

/* ---------- Team & player marks ---------- */

export function TeamLogo({ team, size = 18, className }: { team: string | null | undefined; size?: number; className?: string }) {
  const [err, setErr] = useState(false);
  const src = cdn.teamLogo(team);
  if (!src || err) return <span className={cx("inline-block rounded-sm bg-surface-3", className)} style={{ width: size, height: size }} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} onError={() => setErr(true)} className={cx("inline-block object-contain shrink-0", className)} loading="lazy" />;
}

export function Headshot({ player, size = 32 }: { player: Player; size?: number }) {
  const [err, setErr] = useState(false);
  const src = cdn.headshot(player.id, player.pos, player.team);
  if (!src || err) {
    return (
      <span className="grid place-items-center rounded-full bg-surface-3 text-muted num font-semibold" style={{ width: size, height: size, fontSize: size * 0.4 }}>
        {player.first?.[0]}{player.last?.[0]}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} onError={() => setErr(true)} className="rounded-full bg-surface-3 object-cover" style={{ width: size, height: size }} loading="lazy" />;
}

export function PlayerLink({ player, id, className, children }: { player?: Player; id?: string; className?: string; children?: React.ReactNode }) {
  const pid = player?.id ?? id;
  if (!pid) return <span className={className}>{children ?? "Unknown"}</span>;
  return (
    <Link href={`/players/${pid}`} className={cx("hover:text-gold hover:underline underline-offset-2", className)}>
      {children ?? player?.name ?? pid}
    </Link>
  );
}

/** Compact player identity row: headshot, name, pos, team, status. */
export function PlayerCell({ player, id, showHeadshot = true, sub }: { player: Player | undefined; id?: string; showHeadshot?: boolean; sub?: React.ReactNode }) {
  if (!player) return <span className="text-muted">{id ? `Unknown player (${id})` : "—"}</span>;
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {showHeadshot && <Headshot player={player} size={30} />}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <PlayerLink player={player} className="font-medium truncate" />
          <StatusBadge player={player} />
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-muted">
          <PositionBadge pos={player.pos} />
          <TeamLogo team={player.team} size={14} />
          <span>{player.team ?? "FA"}</span>
          {sub}
        </div>
      </div>
    </div>
  );
}

/* ---------- Layout ---------- */

export function Card({ title, actions, children, className, pad = true }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <h2 className="h2">{title}</h2>
          {actions}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="h1">{title}</h1>
        {sub && <p className="caption mt-1">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

export function StatTile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "gold" | "ok" | "urgent" | "muted" }) {
  const color = tone === "gold" ? "text-gold" : tone === "ok" ? "text-ok" : tone === "urgent" ? "text-urgent" : tone === "muted" ? "text-muted" : "text-ink";
  return (
    <div className="card-2 px-4 py-3 min-w-0">
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className={cx("display text-[30px] mt-1", color)}>{value}</div>
      {sub && <div className="caption mt-1 truncate">{sub}</div>}
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card border-dashed px-6 py-10 text-center">
      <div className="h3">{title}</div>
      {detail && <p className="caption mt-1.5 max-w-md mx-auto">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Unavailable({ what = "Projection data not configured" }: { what?: string }) {
  return <span className="text-faint italic text-[13px]">{what}</span>;
}

export function Expandable({ summary, children, defaultOpen = false, className }: { summary: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 text-left row-hover rounded-md px-1 -mx-1" aria-expanded={open}>
        <span className="text-muted shrink-0">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <div className="flex-1 min-w-0">{summary}</div>
      </button>
      {open && <div className="mt-2 pl-6">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cx("flex flex-wrap gap-1 p-1 rounded-lg bg-surface border border-line", className)}>
      {options.map((o) => (
        <button key={o.value} role="tab" type="button" aria-selected={value === o.value} className="tab text-[13px]" onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="ml-1.5 num text-faint">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Search players"} className={cx("field w-full", className)} aria-label={placeholder ?? "Search"} />
  );
}

export function Skeleton({ h = 16, w, className }: { h?: number; w?: number | string; className?: string }) {
  return <div className={cx("skeleton", className)} style={{ height: h, width: w ?? "100%" }} />;
}

export function fmtPts(n: number | null | undefined, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}
