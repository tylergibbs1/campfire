import type { MutateOperation } from "../client.ts";
import { mapStatus, toMicros } from "../mapping.ts";

export function createAdGroupOp(
  customerId: string,
  tempId: string,
  campaignResourceName: string,
  config: Record<string, unknown>,
): MutateOperation {
  const adGroup: Record<string, unknown> = {
    resourceName: `customers/${customerId}/adGroups/${tempId}`,
    name: config.name,
    campaign: campaignResourceName,
    status: "ENABLED",
    type: "SEARCH_STANDARD",
  };

  if (config.cpc_bid !== undefined) {
    adGroup.cpcBidMicros = toMicros(config.cpc_bid as number);
  }

  return {
    adGroupOperation: { create: adGroup },
  };
}

export function updateAdGroupOp(
  resourceName: string,
  changes: Record<string, unknown>,
): MutateOperation {
  const update: Record<string, unknown> = { resourceName };
  const masks: string[] = [];

  if (changes.name !== undefined) {
    update.name = changes.name;
    masks.push("name");
  }
  if (changes.cpc_bid !== undefined) {
    update.cpcBidMicros = toMicros(changes.cpc_bid as number);
    masks.push("cpc_bid_micros");
  }

  return {
    adGroupOperation: {
      update,
      update_mask: masks.join(","),
    },
  };
}

export function removeAdGroupOp(resourceName: string): MutateOperation {
  return {
    adGroupOperation: { remove: resourceName },
  };
}
