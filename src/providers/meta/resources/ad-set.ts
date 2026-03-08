import type { MetaAdsClient } from "../client.ts";
import {
  toCents,
  mapStatus,
  mapOptimizationGoal,
  mapBillingEvent,
  buildTargeting,
} from "../mapping.ts";

export async function createAdSet(
  client: MetaAdsClient,
  campaignId: string,
  config: Record<string, unknown>,
): Promise<string> {
  const params: Record<string, unknown> = {
    name: config.name,
    campaign_id: campaignId,
    status: "PAUSED",
  };

  const budget = config.budget as Record<string, unknown> | undefined;
  if (budget) {
    if (budget.period === "lifetime") {
      params.lifetime_budget = toCents(budget.amount as number);
    } else {
      params.daily_budget = toCents(budget.amount as number);
    }
  }

  if (config.optimization_goal) {
    params.optimization_goal = mapOptimizationGoal(
      config.optimization_goal as string,
    );
  }

  if (config.billing_event) {
    params.billing_event = mapBillingEvent(config.billing_event as string);
  }

  if (config.targeting) {
    params.targeting = buildTargeting(config.targeting as Record<string, unknown>);
  }

  return client.createAdSet(params);
}

export async function updateAdSet(
  client: MetaAdsClient,
  adSetId: string,
  changes: Record<string, unknown>,
): Promise<void> {
  const params: Record<string, unknown> = {};

  if (changes.name !== undefined) params.name = changes.name;
  if (changes.status !== undefined) params.status = mapStatus(changes.status as string);

  // Handle budget changes
  if (changes["budget.amount"] !== undefined) {
    const period = (changes["budget.period"] as string) ?? "daily";
    if (period === "lifetime") {
      params.lifetime_budget = toCents(changes["budget.amount"] as number);
    } else {
      params.daily_budget = toCents(changes["budget.amount"] as number);
    }
  }

  if (changes.targeting !== undefined) {
    params.targeting = buildTargeting(changes.targeting as Record<string, unknown>);
  }

  if (changes.optimization_goal !== undefined) {
    params.optimization_goal = mapOptimizationGoal(
      changes.optimization_goal as string,
    );
  }

  await client.updateAdSet(adSetId, params);
}
