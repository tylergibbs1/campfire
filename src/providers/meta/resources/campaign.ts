import type { MetaAdsClient } from "../client.ts";
import { mapObjective, mapStatus } from "../mapping.ts";

export async function createCampaign(
  client: MetaAdsClient,
  config: Record<string, unknown>,
): Promise<string> {
  const params: Record<string, unknown> = {
    name: config.name,
    objective: mapObjective(config.objective as string),
    status: mapStatus((config.status as string) ?? "PAUSED"),
    special_ad_categories: config.special_ad_categories ?? [],
  };

  return client.createCampaign(params);
}

export async function updateCampaign(
  client: MetaAdsClient,
  campaignId: string,
  changes: Record<string, unknown>,
): Promise<void> {
  const params: Record<string, unknown> = {};

  if (changes.name !== undefined) params.name = changes.name;
  if (changes.status !== undefined) params.status = mapStatus(changes.status as string);
  if (changes.objective !== undefined)
    params.objective = mapObjective(changes.objective as string);

  await client.updateCampaign(campaignId, params);
}
