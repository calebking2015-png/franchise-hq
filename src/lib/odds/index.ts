/**
 * Betting context from The Odds API (https://the-odds-api.com). Optional: set ODDS_API_KEY in the
 * environment and the Lineups/Moves pages gain game totals and implied team totals. Without a key
 * everything degrades to "not configured" — nothing is guessed.
 */
export interface TeamLine {
  team: string;
  opp: string;
  total: number | null;     // game over/under
  spread: number | null;    // this team's spread (negative = favorite)
  implied: number | null;   // implied team total
  book: string | null;
  commence: string;
}
export type OddsMap = Record<string, TeamLine>;

const NAME_TO_ABBR: Record<string, string> = {
  "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF", "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL", "Denver Broncos": "DEN",
  "Detroit Lions": "DET", "Green Bay Packers": "GB", "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG", "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
};

interface OddsEvent {
  commence_time: string; home_team: string; away_team: string;
  bookmakers?: { key: string; title: string; markets: { key: string; outcomes: { name: string; point?: number }[] }[] }[];
}

/** Average totals/spreads across books, mapped to team abbreviations. */
export function buildOdds(events: OddsEvent[] | null): OddsMap {
  const out: OddsMap = {};
  for (const ev of events ?? []) {
    const home = NAME_TO_ABBR[ev.home_team]; const away = NAME_TO_ABBR[ev.away_team];
    if (!home || !away) continue;
    const totals: number[] = []; const homeSpreads: number[] = []; let book: string | null = null;
    for (const bk of ev.bookmakers ?? []) {
      book ??= bk.title;
      for (const m of bk.markets) {
        if (m.key === "totals") { const o = m.outcomes.find((x) => x.name === "Over"); if (o?.point != null) totals.push(o.point); }
        if (m.key === "spreads") { const o = m.outcomes.find((x) => x.name === ev.home_team); if (o?.point != null) homeSpreads.push(o.point); }
      }
    }
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 2) / 2 : null);
    const total = avg(totals); const hs = avg(homeSpreads);
    const implied = (spread: number | null) => (total != null && spread != null ? Math.round((total / 2 - spread / 2) * 10) / 10 : null);
    out[home] = { team: home, opp: away, total, spread: hs, implied: implied(hs), book: book ? `${(ev.bookmakers ?? []).length} books` : null, commence: ev.commence_time };
    out[away] = { team: away, opp: home, total, spread: hs != null ? -hs : null, implied: implied(hs != null ? -hs : null), book: out[home].book, commence: ev.commence_time };
  }
  return out;
}

export async function fetchOdds(): Promise<{ configured: boolean; odds: OddsMap; note?: string }> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { configured: false, odds: {}, note: "Set ODDS_API_KEY to enable Vegas totals (free tier at the-odds-api.com)." };
  const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?apiKey=${encodeURIComponent(key)}&regions=us&markets=spreads,totals&oddsFormat=american`;
  const res = await fetch(url, { next: { revalidate: 60 * 30 } });
  if (!res.ok) return { configured: true, odds: {}, note: `Odds API responded ${res.status}` };
  return { configured: true, odds: buildOdds((await res.json()) as OddsEvent[]) };
}
