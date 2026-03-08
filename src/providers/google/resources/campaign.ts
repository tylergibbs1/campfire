import type { MutateOperation } from "../client.ts";
import {
  mapChannelType,
  mapStatus,
  mapBiddingStrategy,
  toMicros,
  geoTargetConstant,
} from "../mapping.ts";

export function createCampaignOp(
  customerId: string,
  tempId: string,
  budgetResourceName: string,
  config: Record<string, unknown>,
): MutateOperation {
  const campaign: Record<string, unknown> = {
    resourceName: `customers/${customerId}/campaigns/${tempId}`,
    name: config.name,
    advertisingChannelType: mapChannelType(config.type as string),
    status: mapStatus((config.status as string) ?? "paused"),
    campaignBudget: budgetResourceName,
  };

  // Network settings for search campaigns
  if (config.type === "search") {
    campaign.networkSettings = {
      targetGoogleSearch: true,
      targetSearchNetwork: true,
      targetContentNetwork: false,
    };
  }

  // Bidding
  const bidding = config.bidding as Record<string, unknown> | undefined;
  if (bidding) {
    const strategy = bidding.strategy as string;
    if (strategy === "maximize_conversions") {
      campaign.maximizeConversions = {};
      if (bidding.target_cpa) {
        campaign.maximizeConversions = {
          targetCpaMicros: toMicros(bidding.target_cpa as number),
        };
      }
    } else if (strategy === "maximize_conversion_value") {
      campaign.maximizeConversionValue = {};
      if (bidding.target_roas) {
        campaign.maximizeConversionValue = {
          targetRoas: Number(bidding.target_roas),
        };
      }
    } else if (strategy === "manual_cpc") {
      campaign.manualCpc = {};
    }
  }

  return {
    campaignOperation: { create: campaign },
  };
}

export function updateCampaignOp(
  resourceName: string,
  changes: Record<string, unknown>,
): MutateOperation {
  const update: Record<string, unknown> = { resourceName };
  const masks: string[] = [];

  if (changes.name !== undefined) {
    update.name = changes.name;
    masks.push("name");
  }
  if (changes.status !== undefined) {
    update.status = mapStatus(changes.status as string);
    masks.push("status");
  }

  return {
    campaignOperation: {
      update,
      update_mask: masks.join(","),
    },
  };
}

export function removeCampaignOp(resourceName: string): MutateOperation {
  return {
    campaignOperation: { remove: resourceName },
  };
}

export function createGeoTargetOps(
  customerId: string,
  campaignResourceName: string,
  geoTargets: string[],
): MutateOperation[] {
  return geoTargets
    .map((code) => {
      const constant = geoTargetConstant(code);
      if (!constant) return null;
      return {
        campaignCriterionOperation: {
          create: {
            campaign: campaignResourceName,
            location: {
              geoTargetConstant: `geoTargetConstants/${constant}`,
            },
          },
        },
      } as MutateOperation;
    })
    .filter((op): op is MutateOperation => op !== null);
}
