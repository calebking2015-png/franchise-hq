/**
 * Fantasy Golden Boy (fantasygoldenboy.com) projections — a friend's model, used with permission.
 * Source: two published Google Sheets. The projections sheet carries full stat lines behind each
 * number (rush att/yds/TD, targets/rec/yds/TD, and for QBs pass att/cmp%/yds-per-completion/TD),
 * so we rebuild a Sleeper-style stat line and score it under each league's own settings — no
 * "half-PPR only" approximation needed. No K/DEF, INT or fumble projections: those fall back to Sleeper.
 */
import type { Player, PlayerMap } from "@/lib/sleeper/types";

export const GOLDEN_BOY_URL = "https://fantasygoldenboy.com/nfl-projections/";
export const PROJ_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSdDWisMWQiqYYBBuHmKvOY08GZzwWQiypNZeIIGXmeowzPXiG8S0v3eGb57j1UbQ7Mcb-n03RVxQ6u/pub?gid=927091947&single=true&output=csv";
export const TD_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTlfy6L0zyM3Mz3g9PBrof4Ubi-Xl7F-LFY_ML7kYOMSImGhonDzyK6oU2x22ILs5WgCqdFWcRbATCW/pub?gid=1317666884&single=true&output=csv";

/** His team codes → Sleeper's. */
const TEAM: Record<string, string> = { ARZ: "ARI", BLT: "BAL", CLV: "CLE", HST: "HOU", LA: "LAR", JAC: "JAX", WSH: "WAS" };
export const toSleeperTeam = (t: string) => TEAM[t.toUpperCase()] ?? t.toUpperCase();

export interface GBRow {
  name: string;
  team: string;
  pos: string;
  opp: string;
  /** His headline number (half-PPR, with his modifiers applied). */
  modHalf: number;
  /** 0 = he has this player out of the lineup (injury/suspension); stats are zeroed. */
  active: boolean;
  stats: Record<string, number>;
}

/** Minimal CSV parser: handles quoted fields with commas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (s: string | undefined) => { const n = parseFloat((s ?? "").replace("%", "")); return Number.isFinite(n) ? n : 0; };
const pct = (s: string | undefined) => { const n = num(s); return n > 1 ? n / 100 : n; };

/** Parse the projections sheet into stat lines keyed by Sleeper stat names. */
export function parseProjections(csv: string): GBRow[] {
  const rows = parseCsv(csv);
  const out: GBRow[] = [];
  for (const r of rows) {
    const name = (r[1] ?? "").trim(); const pos = (r[3] ?? "").trim().toUpperCase();
    if (!name || !["QB", "RB", "WR", "TE"].includes(pos) || name === "Player") continue;
    const team = toSleeperTeam((r[2] ?? "").trim());
    const active = num(r[22]) !== 0;
    const stats: Record<string, number> = {};
    if (pos === "QB") {
      const att = num(r[12]), cmpPct = pct(r[13]), ypCo = num(r[14]), paTd = num(r[15]);
      const cmp = att * cmpPct;
      Object.assign(stats, { pass_att: att, pass_cmp: cmp, pass_yd: cmp * ypCo, pass_td: paTd, rush_att: num(r[16]), rush_yd: num(r[16]) * num(r[17]), rush_td: num(r[18]) });
    } else {
      Object.assign(stats, { rush_att: num(r[12]), rush_yd: num(r[14]), rush_td: num(r[15]), rec_tgt: num(r[16]), rec: num(r[19]), rec_yd: num(r[20]), rec_td: num(r[21]) });
    }
    if (!active) for (const k of Object.keys(stats)) stats[k] = 0;
    // Round to sane precision so scoring output looks like a projection, not float noise.
    for (const k of Object.keys(stats)) stats[k] = Math.round(stats[k] * 100) / 100;
    stats.pts_half_ppr = active ? num(r[11]) : 0;
    // His QB stat columns don't reproduce his QB points (his QB formula includes things the sheet
    // doesn't expose), so QBs carry his headline number; the scorer adjusts it for 6-pt pass TD leagues.
    if (pos === "QB") stats.gb_qb_pts = stats.pts_half_ppr;
    out.push({ name, team, pos, opp: (r[4] ?? "").trim(), modHalf: active ? num(r[11]) : 0, active, stats });
  }
  return out;
}

/** TD% sheet → name-keyed map (0–1). */
export function parseTdPct(csv: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of parseCsv(csv)) {
    const name = (r[0] ?? "").trim();
    if (!name || name === "Player" || !r[3]) continue;
    out[normName(name)] = pct(r[3]);
  }
  return out;
}

/** Names his sheet spells differently from Sleeper. Left = his, right = Sleeper's. */
const ALIASES: Record<string, string> = { "kennethgainwell": "kennygainwell", "jordantyson": "jordyntyson" };

/** "CHRISTIAN MCCAFFREY" / "A.J. Brown" / "Marvin Harrison Jr." → comparable key. */
export function normName(s: string) {
  const k = s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");
  return ALIASES[k] ?? k;
}

export interface MatchResult {
  projections: Record<string, { team: string | null; opp: string | null; gameId: string | null; date: string | null; stats: Record<string, number>; tdPct?: number }>;
  unmatched: { name: string; team: string; pos: string }[];
}

/** Map his rows onto Sleeper player ids: name+position, prefer same team, then any team. */
export function matchToSleeper(rows: GBRow[], players: PlayerMap, tdPct: Record<string, number> = {}): MatchResult {
  const index = new Map<string, Player[]>();
  for (const p of Object.values(players)) {
    if (!p.team && !p.active) continue;
    const k = `${normName(p.name)}|${p.pos}`;
    index.set(k, [...(index.get(k) ?? []), p]);
  }
  const projections: MatchResult["projections"] = {};
  const unmatched: MatchResult["unmatched"] = [];
  for (const r of rows) {
    const cands = index.get(`${normName(r.name)}|${r.pos}`) ?? [];
    const p = cands.find((c) => c.team === r.team) ?? cands.find((c) => c.active) ?? cands[0];
    if (!p) { unmatched.push({ name: r.name, team: r.team, pos: r.pos }); continue; }
    projections[p.id] = { team: r.team, opp: r.opp || null, gameId: null, date: null, stats: r.stats, tdPct: tdPct[normName(r.name)] };
  }
  return { projections, unmatched };
}
