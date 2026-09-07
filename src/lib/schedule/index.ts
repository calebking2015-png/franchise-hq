/**
 * NFL schedule from Sleeper's (undocumented) schedule feed: game date and live status per team per week.
 * No kickoff clock times are published, so "locked" is driven by the game's status field, which
 * Sleeper flips off `pre_game` at kickoff — that is exactly the signal lineup locks need.
 */
export interface Game {
  gameId: string;
  week: number;
  date: string;         // YYYY-MM-DD
  home: string;
  away: string;
  status: string;       // pre_game | in_game | complete (Sleeper's values)
}

/** week → team → game */
export type ScheduleMap = Record<number, Record<string, Game>>;

export interface ScheduleRaw { status: string; date: string; home: string; week: number; game_id: string; away: string }

export function buildSchedule(rows: ScheduleRaw[] | null): ScheduleMap {
  const out: ScheduleMap = {};
  for (const r of rows ?? []) {
    const g: Game = { gameId: r.game_id, week: r.week, date: r.date, home: r.home, away: r.away, status: r.status };
    (out[r.week] ??= {})[r.home] = g;
    out[r.week][r.away] = g;
  }
  return out;
}

export function gameFor(s: ScheduleMap | null | undefined, team: string | null | undefined, week: number): Game | null {
  if (!s || !team) return null;
  return s[week]?.[team] ?? null;
}

export function onBye(s: ScheduleMap | null | undefined, team: string | null | undefined, week: number): boolean {
  if (!s || !team || !s[week]) return false;
  return !s[week][team];
}

export function hasStarted(g: Game | null): boolean {
  return !!g && g.status !== "pre_game";
}
export function isFinal(g: Game | null): boolean {
  return !!g && /complete|final|closed/i.test(g.status);
}

/** Short label for a lineup table: "Sun 9/13", "LIVE", "Final", "BYE". */
export function kickLabel(s: ScheduleMap | null | undefined, team: string | null | undefined, week: number): { text: string; tone: "live" | "final" | "bye" | "upcoming" | "none" } {
  if (!team) return { text: "—", tone: "none" };
  if (!s || !s[week]) return { text: "—", tone: "none" };
  const g = s[week][team];
  if (!g) return { text: "BYE", tone: "bye" };
  if (isFinal(g)) return { text: "Final", tone: "final" };
  if (hasStarted(g)) return { text: "LIVE", tone: "live" };
  const d = new Date(g.date + "T12:00:00");
  return { text: `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`, tone: "upcoming" };
}

export function opponentFor(s: ScheduleMap | null | undefined, team: string | null | undefined, week: number): string | null {
  const g = gameFor(s, team, week);
  if (!g || !team) return null;
  return g.home === team ? `vs ${g.away}` : `@ ${g.home}`;
}
