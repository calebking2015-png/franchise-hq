/** Next-week bye look-ahead: which of your rostered players sit out next week, per league. */
import type { Portfolio } from "@/lib/portfolio/types";
import type { PlayerMap } from "@/lib/sleeper/types";
import { onBye, type ScheduleMap } from "@/lib/schedule";

export interface LeagueByes {
  leagueId: string;
  leagueName: string;
  week: number;
  starters: string[]; // current starters whose team is on bye next week
  bench: string[];
  teams: string[];    // NFL teams on bye
}

export function nextWeekByes(p: Portfolio, players: PlayerMap, schedule: ScheduleMap | null | undefined): LeagueByes[] {
  const week = p.week + 1;
  if (!schedule || !schedule[week]) return [];
  const teams = new Set<string>();
  const out: LeagueByes[] = [];
  for (const b of p.leagues) {
    const r = b.myRoster; if (!r) continue;
    const st = new Set(r.starters ?? []);
    const starters: string[] = [], bench: string[] = [];
    for (const id of r.players ?? []) {
      const t = players[id]?.team;
      if (!t || !onBye(schedule, t, week)) continue;
      teams.add(t);
      (st.has(id) ? starters : bench).push(id);
    }
    if (starters.length || bench.length) out.push({ leagueId: b.league.league_id, leagueName: b.league.name, week, starters, bench, teams: [...teams] });
  }
  return out.sort((a, c) => c.starters.length - a.starters.length);
}
