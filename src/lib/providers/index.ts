/**
 * Data provider contracts. Sleeper is the only live provider today.
 * Everything else is a NullProvider that reports "not configured" so the UI
 * never has to invent projections, values, or schedules.
 */
import type { StatLine } from "@/lib/scoring/engine";

/** Every number shown in the UI carries a source tag. */
export type DataSource = "sleeper" | "third-party" | "calculated" | "ai" | "unavailable";

export interface Sourced<T> {
  value: T | null;
  source: DataSource;
  provider?: string;
  note?: string;
}

export const unavailable = <T,>(note = "Not configured"): Sourced<T> => ({
  value: null,
  source: "unavailable",
  note,
});

export interface ProjectionProvider {
  readonly name: string;
  readonly configured: boolean;
  /** Raw stat projections for a player in a week. Scoring engine converts to points per league. */
  weekly(playerId: string, season: string, week: number): Promise<Sourced<StatLine>>;
}

export interface RankingProvider {
  readonly name: string;
  readonly configured: boolean;
  restOfSeason(playerId: string, format: "1qb" | "sf"): Promise<Sourced<number>>;
}

export interface InjuryProvider {
  readonly name: string;
  readonly configured: boolean;
}

export interface NewsProvider {
  readonly name: string;
  readonly configured: boolean;
  recent(playerId: string): Promise<Sourced<{ title: string; url: string; at: string }[]>>;
}

export interface DynastyValueProvider {
  readonly name: string;
  readonly configured: boolean;
  value(playerId: string, format: "1qb" | "sf", tePremium: boolean): Promise<Sourced<number>>;
}

export interface BettingDataProvider {
  readonly name: string;
  readonly configured: boolean;
  gameTotal(team: string, week: number): Promise<Sourced<number>>;
}

/** NFL schedule (byes, kickoff times). Not part of Sleeper's documented API. */
export interface ScheduleProvider {
  readonly name: string;
  readonly configured: boolean;
  byeWeek(team: string, season: string): Sourced<number>;
  kickoff(team: string, season: string, week: number): Sourced<string>;
}

class NullProjection implements ProjectionProvider {
  name = "none"; configured = false;
  async weekly() { return unavailable<StatLine>("Projection data not configured"); }
}
class NullRanking implements RankingProvider {
  name = "none"; configured = false;
  async restOfSeason() { return unavailable<number>("Ranking data not configured"); }
}
class NullNews implements NewsProvider {
  name = "none"; configured = false;
  async recent() { return unavailable<{ title: string; url: string; at: string }[]>("News provider not configured"); }
}
class NullDynasty implements DynastyValueProvider {
  name = "none"; configured = false;
  async value() { return unavailable<number>("Dynasty value source not configured"); }
}
class NullBetting implements BettingDataProvider {
  name = "none"; configured = false;
  async gameTotal() { return unavailable<number>("Betting data not configured"); }
}
class NullSchedule implements ScheduleProvider {
  name = "none"; configured = false;
  byeWeek() { return unavailable<number>("Bye weeks not configured"); }
  kickoff() { return unavailable<string>("Kickoff times not configured"); }
}

/** Injury/status flags come from Sleeper's player feed. */
export const SleeperInjuryProvider: InjuryProvider = { name: "sleeper", configured: true };

/** Sleeper's weekly projections (Rotowire-sourced). Fetched in bulk by /api/sleeper/projections; the
 *  scoring engine converts the raw stat line into points under each league's own scoring_settings. */
class SleeperProjection implements ProjectionProvider {
  name = "Sleeper / Rotowire"; configured = true;
  async weekly(playerId: string, season: string, week: number) {
    const { sleeper, trimProjections } = await import("@/lib/sleeper/client");
    const map = trimProjections(await sleeper.projectionsRaw(season, week));
    const p = map[playerId];
    return p ? ({ value: p.stats, source: "third-party", provider: this.name } as Sourced<StatLine>) : unavailable<StatLine>("No projection for this player");
  }
}
void NullProjection;

export const providers = {
  projection: new SleeperProjection() as ProjectionProvider,
  ranking: new NullRanking() as RankingProvider,
  injury: SleeperInjuryProvider,
  news: new NullNews() as NewsProvider,
  dynastyValue: new NullDynasty() as DynastyValueProvider,
  betting: new NullBetting() as BettingDataProvider,
  schedule: new NullSchedule() as ScheduleProvider,
};

/** Snapshot of what's live, shipped to the client so the UI can label data. */
export function providerStatus() {
  return {
    sleeper: { configured: true, name: "Sleeper (read-only)" },
    projection: { configured: providers.projection.configured, name: providers.projection.name },
    ranking: { configured: providers.ranking.configured, name: providers.ranking.name },
    injury: { configured: providers.injury.configured, name: providers.injury.name },
    news: { configured: providers.news.configured, name: providers.news.name },
    dynastyValue: { configured: providers.dynastyValue.configured, name: providers.dynastyValue.name },
    betting: { configured: !!process.env.ODDS_API_KEY, name: process.env.ODDS_API_KEY ? "The Odds API" : "none" },
    schedule: { configured: true, name: "Sleeper schedule (dates + live status; no clock times)" },
  };
}
export type ProviderStatus = ReturnType<typeof providerStatus>;
