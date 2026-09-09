import type { LeagueBundle } from "@/lib/portfolio/types";
import type { Player, PlayerMap } from "@/lib/sleeper/types";
import { startingSlots, slotAccepts, slotLabel } from "@/lib/league/format";
import type { SleeperTrendingPlayer } from "@/lib/sleeper/types";

export type Severity = "urgent" | "warning" | "info";

export type AlertKind =
  | "empty_slot" | "out_starting" | "ir_starting" | "suspended_starting" | "inactive_starting"
  | "doubtful_starting" | "questionable_starting" | "ir_slot_open" | "healthy_on_ir"
  | "injured_bench" | "free_agent_rostered" | "slot_mismatch" | "waiver_opportunity";

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: Severity;
  leagueId: string;
  leagueName: string;
  title: string;
  detail: string;
  playerId?: string;
  slot?: string;
  source: "sleeper" | "calculated";
}

export const SEVERITY_ORDER: Record<Severity, number> = { urgent: 0, warning: 1, info: 2 };

const HARD_OUT = new Set(["Out", "IR", "PUP", "Sus", "COV", "NA", "DNR"]);

export function isHardOut(p: Player | undefined) {
  if (!p) return false;
  if (p.injury && HARD_OUT.has(p.injury)) return true;
  if (p.status && /injured reserve|pup|suspended|inactive|non football/i.test(p.status)) return true;
  return false;
}

/**
 * Can this player legally go on IR in this league? Sleeper exposes the commissioner's IR rules
 * (reserve_allow_out / _sus / _cov / _na / _dnr / _doubtful). Real IR/PUP is always allowed.
 */
export function irEligible(p: Player | undefined, league: LeagueBundle["league"]): boolean {
  if (!p) return false;
  const st = league.settings ?? {};
  if (p.injury === "IR" || p.injury === "PUP" || /injured reserve|pup/i.test(p.status ?? "")) return true;
  if (p.injury === "Out") return !!st.reserve_allow_out;
  if (p.injury === "Sus" || /suspended/i.test(p.status ?? "")) return !!st.reserve_allow_sus;
  if (p.injury === "COV") return !!st.reserve_allow_cov;
  if (p.injury === "NA") return !!st.reserve_allow_na;
  if (p.injury === "DNR") return !!st.reserve_allow_dnr;
  if (p.injury === "Doubtful") return !!st.reserve_allow_doubtful;
  return false;
}

export function statusLabel(p: Player | undefined): string | null {
  if (!p) return null;
  if (p.injury) return p.injury;
  if (p.status && /injured reserve/i.test(p.status)) return "IR";
  if (p.status === "Inactive" || !p.team) return "FA";
  return null;
}

/** Scan one league's lineup for issues we can prove from Sleeper data alone. */
export function leagueAlerts(b: LeagueBundle, players: PlayerMap): Alert[] {
  const alerts: Alert[] = [];
  const roster = b.myRoster;
  if (!roster) return alerts;
  const L = { leagueId: b.league.league_id, leagueName: b.league.name };
  const slots = startingSlots(b.league);
  const starters = roster.starters ?? [];
  const bench = (roster.players ?? []).filter(
    (id) => !starters.includes(id) && !(roster.reserve ?? []).includes(id) && !(roster.taxi ?? []).includes(id),
  );
  const push = (a: Omit<Alert, "id" | "leagueId" | "leagueName">) =>
    alerts.push({ id: `${L.leagueId}:${a.kind}:${a.playerId ?? a.slot ?? alerts.length}`, ...L, ...a });

  slots.forEach((slot, i) => {
    const pid = starters[i];
    const label = slotLabel(slot);
    if (!pid || pid === "0") {
      push({ kind: "empty_slot", severity: "urgent", slot, title: `Empty ${label} slot`, detail: "No player in this starting spot.", source: "sleeper" });
      return;
    }
    const p = players[pid];
    if (!p) return;
    const who = `${p.name} (${p.pos}${p.team ? ` · ${p.team}` : ""})`;

    if (p.injury === "Out") push({ kind: "out_starting", severity: "urgent", playerId: pid, slot, title: `${who} is OUT`, detail: `Starting at ${label}.`, source: "sleeper" });
    else if (p.injury === "IR" || p.injury === "PUP" || /injured reserve|pup/i.test(p.status ?? ""))
      push({ kind: "ir_starting", severity: "urgent", playerId: pid, slot, title: `${who} is on IR`, detail: `Starting at ${label}.`, source: "sleeper" });
    else if (p.injury === "Sus") push({ kind: "suspended_starting", severity: "urgent", playerId: pid, slot, title: `${who} is suspended`, detail: `Starting at ${label}.`, source: "sleeper" });
    else if (p.injury === "COV" || p.injury === "NA" || p.injury === "DNR")
      push({ kind: "out_starting", severity: "urgent", playerId: pid, slot, title: `${who} is ${p.injury}`, detail: `Starting at ${label}.`, source: "sleeper" });
    else if (!p.team || p.status === "Inactive")
      push({ kind: "inactive_starting", severity: "urgent", playerId: pid, slot, title: `${who} has no NFL team`, detail: `Starting at ${label} but listed as a free agent/inactive.`, source: "sleeper" });
    else if (p.injury === "Doubtful") push({ kind: "doubtful_starting", severity: "warning", playerId: pid, slot, title: `${who} is Doubtful`, detail: `Starting at ${label}. Line up a replacement.`, source: "sleeper" });
    else if (p.injury === "Questionable") push({ kind: "questionable_starting", severity: "info", playerId: pid, slot, title: `${who} is Questionable`, detail: `Starting at ${label}${p.injuryPart ? ` · ${p.injuryPart}` : ""}. Check status before kickoff.`, source: "sleeper" });

    if (!slotAccepts(slot, p.pos))
      push({ kind: "slot_mismatch", severity: "warning", playerId: pid, slot, title: `${who} in ${label}`, detail: `Position doesn't match this slot as configured.`, source: "calculated" });
  });

  // IR slot management.
  const irSlots = b.format.irSlots;
  const reserve = roster.reserve ?? [];
  if (irSlots > 0 && reserve.length < irSlots) {
    for (const id of bench) {
      const p = players[id];
      if (!isHardOut(p)) continue;
      if (irEligible(p, b.league))
        push({ kind: "ir_slot_open", severity: "warning", playerId: id, title: `Move ${p.name} to IR`, detail: `${p.injury ?? p.status}. You have ${irSlots - reserve.length} open IR slot${irSlots - reserve.length === 1 ? "" : "s"} — free a bench spot.`, source: "calculated" });
      else
        push({ kind: "injured_bench", severity: "info", playerId: id, title: `${p.name} (${p.injury ?? p.status}) on bench`, detail: `This league doesn't allow ${p.injury === "Sus" ? "suspended" : p.injury ?? "this status"} players on IR — he has to hold a bench spot or be dropped.`, source: "calculated" });
    }
  }
  for (const id of reserve) {
    const p = players[id];
    if (p && p.team && !irEligible(p, b.league))
      push({ kind: "healthy_on_ir", severity: "warning", playerId: id, title: `${p.name} may be IR-ineligible`, detail: `Listed ${p.injury ?? p.status ?? "healthy"} — Sleeper may lock your lineup until he's moved.`, source: "calculated" });
  }

  // Dead roster spots.
  for (const id of bench) {
    const p = players[id];
    if (!p) continue;
    if (!p.team || p.status === "Inactive")
      push({ kind: "free_agent_rostered", severity: "info", playerId: id, title: `${p.name} has no NFL team`, detail: "Occupying a bench spot as a free agent.", source: "sleeper" });
    else if (isHardOut(p) && irSlots === 0)
      push({ kind: "injured_bench", severity: "info", playerId: id, title: `${p.name} (${p.injury ?? p.status}) on bench`, detail: "No IR slots in this league — consider whether the spot is worth holding.", source: "calculated" });
    else if (isHardOut(p) && reserve.length >= irSlots && irEligible(p, b.league))
      push({ kind: "injured_bench", severity: "info", playerId: id, title: `${p.name} (${p.injury ?? p.status}) on bench`, detail: "IR is full — he's eligible if a slot opens up.", source: "calculated" });
  }

  return alerts;
}

/** Trending adds available in a league where you have a plausible need — a signal, not a verdict. */
export function waiverAlerts(
  b: LeagueBundle,
  players: PlayerMap,
  trending: SleeperTrendingPlayer[],
  topN = 15,
): Alert[] {
  if (!b.myRoster) return [];
  const out: Alert[] = [];
  for (const t of trending.slice(0, topN)) {
    if (b.ownership[t.player_id]) continue;
    const p = players[t.player_id];
    if (!p || !p.team || isHardOut(p)) continue;
    // Skip positions this league has no starting slot for (K/DEF in most dynasty leagues).
    if (!b.format.starters.some((s) => (b.format.eligibility[s.slot] ?? [s.slot]).includes(p.pos))) continue;
    out.push({
      id: `${b.league.league_id}:waiver:${p.id}`,
      kind: "waiver_opportunity",
      severity: "info",
      leagueId: b.league.league_id,
      leagueName: b.league.name,
      playerId: p.id,
      title: `${p.name} (${p.pos} · ${p.team}) is available`,
      detail: `+${t.count.toLocaleString()} adds on Sleeper in the last 24h.`,
      source: "sleeper",
    });
  }
  return out;
}

export function sortAlerts(alerts: Alert[]) {
  return [...alerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.leagueName.localeCompare(b.leagueName));
}
