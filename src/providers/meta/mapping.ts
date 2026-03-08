/**
 * Maps campfire config values to Meta Marketing API format.
 */

export function toCents(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return String(Math.round(num * 100));
}

export function fromCents(cents: string | number): number {
  const num = typeof cents === "string" ? parseInt(cents, 10) : cents;
  return num / 100;
}

export function mapObjective(objective: string): string {
  const map: Record<string, string> = {
    conversions: "OUTCOME_SALES",
    traffic: "OUTCOME_TRAFFIC",
    engagement: "OUTCOME_ENGAGEMENT",
    leads: "OUTCOME_LEADS",
    awareness: "OUTCOME_AWARENESS",
    app_installs: "OUTCOME_APP_PROMOTION",
  };
  return map[objective] ?? objective.toUpperCase();
}

export function mapStatus(status: string): string {
  const map: Record<string, string> = {
    active: "ACTIVE",
    paused: "PAUSED",
    deleted: "DELETED",
    archived: "ARCHIVED",
  };
  return map[status.toLowerCase()] ?? status.toUpperCase();
}

export function mapOptimizationGoal(goal: string): string {
  const map: Record<string, string> = {
    offsite_conversions: "OFFSITE_CONVERSIONS",
    link_clicks: "LINK_CLICKS",
    impressions: "IMPRESSIONS",
    reach: "REACH",
    landing_page_views: "LANDING_PAGE_VIEWS",
    app_installs: "APP_INSTALLS",
  };
  return map[goal] ?? goal.toUpperCase();
}

export function mapBillingEvent(event: string): string {
  const map: Record<string, string> = {
    impressions: "IMPRESSIONS",
    link_clicks: "LINK_CLICKS",
    app_installs: "APP_INSTALLS",
  };
  return map[event] ?? event.toUpperCase();
}

export function buildTargeting(targeting: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (targeting.geo_locations) {
    result.geo_locations = targeting.geo_locations;
  }

  if (targeting.age_min !== undefined) {
    result.age_min = targeting.age_min;
  }
  if (targeting.age_max !== undefined) {
    result.age_max = targeting.age_max;
  }

  if (targeting.genders) {
    const genders = targeting.genders as string[];
    if (genders.includes("all")) {
      // Don't set — targets all genders by default
    } else {
      result.genders = genders.map((g) => (g === "male" ? 1 : 2));
    }
  }

  if (targeting.publisher_platforms) {
    result.publisher_platforms = targeting.publisher_platforms;
  }

  if (targeting.placements) {
    const placements = targeting.placements as Record<string, string[]>;
    if (placements.facebook) {
      result.facebook_positions = placements.facebook;
    }
    if (placements.instagram) {
      result.instagram_positions = placements.instagram;
    }
  }

  if (targeting.custom_audiences) {
    result.custom_audiences = targeting.custom_audiences;
  }

  return result;
}
