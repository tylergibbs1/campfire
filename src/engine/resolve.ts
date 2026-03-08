import type { CampaignFile } from "../config/schema.ts";
import { resourceKey, slugify } from "../config/references.ts";

export interface ConfigResource {
  provider: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
}

/**
 * Flatten campaign config into a map of resource key → config,
 * suitable for diffing against state.
 */
export function flattenCampaigns(
  campaigns: CampaignFile,
): Map<string, ConfigResource> {
  const resources = new Map<string, ConfigResource>();

  for (const campaign of campaigns.campaigns) {
    const provider = campaign.provider;
    const key = resourceKey(provider, "campaign", campaign.name);

    // Extract campaign-level config (without nested children)
    const { ad_groups, ad_sets, ...campaignConfig } = campaign as any;

    resources.set(key, {
      provider,
      type: "campaign",
      name: campaign.name,
      config: campaignConfig,
    });

    if (provider === "google" && ad_groups) {
      for (const ag of ad_groups) {
        const agKey = resourceKey(provider, "ad_group", ag.name);
        const { ads, keywords, ...agConfig } = ag;
        resources.set(agKey, {
          provider,
          type: "ad_group",
          name: ag.name,
          config: { ...agConfig, campaign: campaign.name },
        });

        if (ads) {
          for (const ad of ads) {
            const adName = ad.headlines?.[0] ?? "ad";
            const adKey = resourceKey(provider, "ad", adName);
            resources.set(adKey, {
              provider,
              type: "ad",
              name: adName,
              config: { ...ad, ad_group: ag.name, campaign: campaign.name },
            });
          }
        }

        if (keywords) {
          for (const kw of keywords) {
            const kwKey = resourceKey(
              provider,
              "keyword",
              `${ag.name}:${kw.text}`,
            );
            resources.set(kwKey, {
              provider,
              type: "keyword",
              name: kw.text,
              config: { ...kw, ad_group: ag.name, campaign: campaign.name },
            });
          }
        }
      }
    }

    if (provider === "meta" && ad_sets) {
      for (const adSet of ad_sets) {
        const asKey = resourceKey(provider, "ad_set", adSet.name);
        const { ads, ...asConfig } = adSet;
        resources.set(asKey, {
          provider,
          type: "ad_set",
          name: adSet.name,
          config: { ...asConfig, campaign: campaign.name },
        });

        if (ads) {
          for (const ad of ads) {
            const adKey = resourceKey(provider, "ad", ad.name);
            resources.set(adKey, {
              provider,
              type: "ad",
              name: ad.name,
              config: { ...ad, ad_set: adSet.name, campaign: campaign.name },
            });
          }
        }
      }
    }
  }

  return resources;
}
