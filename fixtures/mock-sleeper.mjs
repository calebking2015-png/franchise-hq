// Dev-only mock of Sleeper's documented API *shape* so the UI can be exercised
// offline. Run: node fixtures/mock-sleeper.mjs, then SLEEPER_API_BASE=http://localhost:4010/v1 npm run dev
// Nothing here ships to users; the app never reads this file.
import http from "node:http";

const P = {
  "4046": { player_id: "4046", first_name: "Patrick", last_name: "Mahomes", full_name: "Patrick Mahomes", position: "QB", team: "KC", status: "Active", injury_status: null, age: 30, years_exp: 9, number: 15, active: true, search_rank: 5, depth_chart_order: 1 },
  "4984": { player_id: "4984", first_name: "Josh", last_name: "Allen", full_name: "Josh Allen", position: "QB", team: "BUF", status: "Active", injury_status: null, age: 30, years_exp: 8, number: 17, active: true, search_rank: 2 },
  "7564": { player_id: "7564", first_name: "Ja'Marr", last_name: "Chase", full_name: "Ja'Marr Chase", position: "WR", team: "CIN", status: "Active", injury_status: "Questionable", injury_body_part: "Hip", age: 26, years_exp: 5, number: 1, active: true, search_rank: 1 },
  "8155": { player_id: "8155", first_name: "Breece", last_name: "Hall", full_name: "Breece Hall", position: "RB", team: "NYJ", status: "Active", injury_status: null, age: 25, years_exp: 4, number: 20, active: true, search_rank: 20 },
  "9226": { player_id: "9226", first_name: "Bijan", last_name: "Robinson", full_name: "Bijan Robinson", position: "RB", team: "ATL", status: "Active", injury_status: "Out", injury_body_part: "Ankle", age: 24, years_exp: 3, number: 7, active: true, search_rank: 4 },
  "6794": { player_id: "6794", first_name: "Justin", last_name: "Jefferson", full_name: "Justin Jefferson", position: "WR", team: "MIN", status: "Active", injury_status: null, age: 27, years_exp: 6, number: 18, active: true, search_rank: 3 },
  "5850": { player_id: "5850", first_name: "Josh", last_name: "Jacobs", full_name: "Josh Jacobs", position: "RB", team: "GB", status: "Active", injury_status: null, age: 28, years_exp: 7, number: 8, active: true, search_rank: 18 },
  "4881": { player_id: "4881", first_name: "Lamar", last_name: "Jackson", full_name: "Lamar Jackson", position: "QB", team: "BAL", status: "Active", injury_status: null, age: 29, years_exp: 8, number: 8, active: true, search_rank: 6 },
  "6813": { player_id: "6813", first_name: "Trey", last_name: "McBride", full_name: "Trey McBride", position: "TE", team: "ARI", status: "Active", injury_status: null, age: 26, years_exp: 4, number: 85, active: true, search_rank: 25 },
  "8167": { player_id: "8167", first_name: "George", last_name: "Pickens", full_name: "George Pickens", position: "WR", team: "DAL", status: "Active", injury_status: "Doubtful", injury_body_part: "Hamstring", age: 25, years_exp: 4, number: 3, active: true, search_rank: 40 },
  "2133": { player_id: "2133", first_name: "Davante", last_name: "Adams", full_name: "Davante Adams", position: "WR", team: "LAR", status: "Active", injury_status: null, age: 33, years_exp: 12, number: 17, active: true, search_rank: 60 },
  "11566": { player_id: "11566", first_name: "Brock", last_name: "Bowers", full_name: "Brock Bowers", position: "TE", team: "LV", status: "Active", injury_status: null, age: 23, years_exp: 2, number: 89, active: true, search_rank: 15 },
  "12500": { player_id: "12500", first_name: "Rookie", last_name: "Runner", full_name: "Rookie Runner", position: "RB", team: "DEN", status: "Active", injury_status: null, age: 22, years_exp: 0, number: 23, active: true, search_rank: 90 },
  "1234": { player_id: "1234", first_name: "Old", last_name: "Veteran", full_name: "Old Veteran", position: "RB", team: null, status: "Inactive", injury_status: null, age: 34, years_exp: 12, active: false },
  "5555": { player_id: "5555", first_name: "Hurt", last_name: "Receiver", full_name: "Hurt Receiver", position: "WR", team: "SEA", status: "Injured Reserve", injury_status: "IR", injury_body_part: "Knee", age: 27, years_exp: 5, active: true, search_rank: 200 },
  "7000": { player_id: "7000", first_name: "Harrison", last_name: "Butker", full_name: "Harrison Butker", position: "K", team: "KC", status: "Active", injury_status: null, age: 31, years_exp: 9, active: true, search_rank: 300 },
  "BAL": { player_id: "BAL", first_name: "Baltimore", last_name: "Ravens", position: "DEF", team: "BAL", status: "Active", active: true, search_rank: 400 },
  "SF": { player_id: "SF", first_name: "San Francisco", last_name: "49ers", position: "DEF", team: "SF", status: "Active", active: true, search_rank: 401 },
  "9999": { player_id: "9999", first_name: "Waiver", last_name: "Darling", full_name: "Waiver Darling", position: "WR", team: "HOU", status: "Active", injury_status: null, age: 24, years_exp: 2, number: 11, active: true, search_rank: 120 },
  "9998": { player_id: "9998", first_name: "Backup", last_name: "Back", full_name: "Backup Back", position: "RB", team: "PHI", status: "Active", injury_status: null, age: 25, years_exp: 3, active: true, search_rank: 150 },
};

const user = { user_id: "u1", username: "poppysavage", display_name: "Poppysavage", avatar: null };
const state = { week: 1, display_week: 1, season: "2026", season_type: "regular", league_season: "2026", previous_season: "2025", leg: 1, season_start_date: "2026-09-10" };

const SCORING_HALF = { pass_yd: 0.04, pass_td: 4, pass_int: -1, rush_yd: 0.1, rush_td: 6, rec: 0.5, rec_yd: 0.1, rec_td: 6, fum_lost: -2, bonus_rec_te: 0.5, xpm: 1, fgm_0_19: 3, fgm_50p: 5, sack: 1, int: 2, def_td: 6, pts_allow_0: 10 };
const SCORING_PPR = { ...SCORING_HALF, rec: 1, bonus_rec_te: 0 };

const leagues = [
  { league_id: "L1", name: "TFFL", season: "2026", season_type: "regular", status: "in_season", sport: "nfl", total_rosters: 12, roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN", "BN", "BN", "BN", "IR"], scoring_settings: SCORING_HALF, settings: { type: 0, num_teams: 12, waiver_type: 2, waiver_budget: 100, reserve_slots: 1, playoff_teams: 6, playoff_week_start: 15, trade_deadline: 12 }, previous_league_id: null, draft_id: "d1", avatar: null },
  { league_id: "L2", name: "Dynasty Degens", season: "2026", season_type: "regular", status: "in_season", sport: "nfl", total_rosters: 12, roster_positions: ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "BN", "BN", "BN", "BN", "BN", "BN", "IR", "IR", "TAXI", "TAXI"], scoring_settings: SCORING_PPR, settings: { type: 2, num_teams: 12, waiver_type: 2, waiver_budget: 200, reserve_slots: 2, taxi_slots: 2, playoff_teams: 6, playoff_week_start: 15 }, previous_league_id: "L2p", draft_id: "d2", avatar: null },
  { league_id: "L3", name: "Work League", season: "2026", season_type: "regular", status: "in_season", sport: "nfl", total_rosters: 10, roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN", "BN", "BN"], scoring_settings: SCORING_PPR, settings: { type: 0, num_teams: 10, waiver_type: 0, playoff_teams: 4, playoff_week_start: 15 }, previous_league_id: null, draft_id: "d3", avatar: null },
];

const users = (n) => Array.from({ length: n }, (_, i) => ({ user_id: i === 0 ? "u1" : `u${i + 1}`, display_name: i === 0 ? "Poppysavage" : `Manager ${i + 1}`, avatar: null, metadata: { team_name: i === 0 ? "Jim Ball" : `Team ${i + 1}` } }));
const roster = (rid, owner, players, starters, extra = {}) => ({ roster_id: rid, owner_id: owner, league_id: "x", players, starters, reserve: extra.reserve ?? [], taxi: extra.taxi ?? [], settings: { wins: extra.w ?? 0, losses: extra.l ?? 0, ties: 0, fpts: extra.pf ?? 0, fpts_decimal: 0, fpts_against: extra.pa ?? 0, fpts_against_decimal: 0, waiver_position: rid, waiver_budget_used: extra.faab ?? 0 } });

const rosters = {
  L1: [ roster(1, "u1", ["4984", "9226", "8155", "7564", "6794", "6813", "5850", "7000", "BAL", "8167", "1234", "5555", "9998"], ["4984", "9226", "8155", "7564", "6794", "6813", "5850", "7000", "BAL"], { w: 0, l: 0, faab: 12 }),
        roster(2, "u2", ["4046", "2133", "11566", "SF"], ["4046", "0", "0", "2133", "0", "11566", "0", "0", "SF"]),
        ...Array.from({ length: 10 }, (_, i) => roster(i + 3, `u${i + 3}`, [], ["0","0","0","0","0","0","0","0","0"])) ],
  L2: [ roster(1, "u1", ["4046", "4881", "8155", "5850", "7564", "6794", "8167", "11566", "12500", "5555", "9998"], ["4046", "8155", "5850", "7564", "6794", "8167", "11566", "9998", "4881"], { w: 0, l: 0, taxi: ["12500"], reserve: [], faab: 0 }),
        roster(2, "u2", ["4984", "9226", "2133", "6813"], ["4984", "9226", "0", "2133", "0", "0", "6813", "0", "0"]),
        ...Array.from({ length: 10 }, (_, i) => roster(i + 3, `u${i + 3}`, [], [])) ],
  L3: [ roster(1, "u1", ["4881", "5850", "9998", "7564", "2133", "6813", "12500", "7000", "SF", "9226"], ["4881", "5850", "9998", "7564", "2133", "6813", "12500", "7000", "SF"], { w: 0, l: 0 }),
        roster(2, "u2", ["4984", "8155", "6794", "11566", "BAL"], ["4984", "8155", "0", "6794", "0", "11566", "0", "0", "BAL"]),
        ...Array.from({ length: 8 }, (_, i) => roster(i + 3, `u${i + 3}`, [], [])) ],
};

const matchups = (lid) => {
  const rs = rosters[lid];
  return rs.map((r, i) => ({ roster_id: r.roster_id, matchup_id: Math.floor(i / 2) + 1, points: r.roster_id === 1 ? 24.6 : r.roster_id === 2 ? 31.2 : 0, starters: r.starters, players: r.players, starters_points: r.starters.map((s, k) => (r.roster_id <= 2 && k === 0 ? (r.roster_id === 1 ? 24.6 : 31.2) : 0)), players_points: {} }));
};

const trending = [{ player_id: "9999", count: 8542 }, { player_id: "9998", count: 4100 }, { player_id: "12500", count: 2200 }, { player_id: "2133", count: 900 }];
const tradedPicks = [{ season: "2027", round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }, { season: "2027", round: 2, roster_id: 1, previous_owner_id: 1, owner_id: 3 }];
const transactions = [{ transaction_id: "t1", type: "waiver", status: "complete", created: Date.now() - 86400000, roster_ids: [1], adds: { "9998": 1 }, drops: { "1234": 1 }, settings: { waiver_bid: 7 } }, { transaction_id: "t2", type: "trade", status: "complete", created: Date.now() - 2 * 86400000, roster_ids: [1, 2], adds: { "4046": 1, "4984": 2 }, drops: null, draft_picks: tradedPicks.slice(0, 1) }];

const routes = [
  [/^\/v1\/user\/poppysavage$/i, () => user],
  [/^\/v1\/state\/nfl$/, () => state],
  [/^\/v1\/user\/u1\/leagues\/nfl\/2026$/, () => leagues],
  [/^\/v1\/league\/(L\d)\/rosters$/, (m) => rosters[m[1]].map((r) => ({ ...r, league_id: m[1] }))],
  [/^\/v1\/league\/(L\d)\/users$/, (m) => users(leagues.find((l) => l.league_id === m[1]).total_rosters)],
  [/^\/v1\/league\/(L\d)\/matchups\/\d+$/, (m) => matchups(m[1])],
  [/^\/v1\/league\/(L\d)\/transactions\/\d+$/, () => transactions],
  [/^\/v1\/league\/(L\d)\/traded_picks$/, () => tradedPicks],
  [/^\/v1\/players\/nfl\/trending\/add/, () => trending],
  [/^\/v1\/players\/nfl\/trending\/drop/, () => [{ player_id: "2133", count: 3000 }]],
  [/^\/v1\/players\/nfl$/, () => P],
];

http.createServer((req, res) => {
  const path = req.url.split("?")[0];
  for (const [re, fn] of routes) { const m = path.match(re); if (m) { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(fn(m))); } }
  res.statusCode = 404; res.end("null");
}).listen(4010, () => console.log("mock sleeper on :4010"));
