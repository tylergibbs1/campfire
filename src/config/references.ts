import type { CampaignFile } from "./schema.ts";

export interface ResourceRef {
  type: string;
  provider: string;
  name: string;
  parent?: string;
}

/**
 * Flatten a campaign file into a list of resource references
 * for cross-reference resolution and dependency tracking.
 */
export function extractResourceRefs(config: CampaignFile): ResourceRef[] {
  const refs: ResourceRef[] = [];

  for (const campaign of config.campaigns) {
    const provider = campaign.provider;
    const campaignRef = `${provider}:campaign:${slugify(campaign.name)}`;

    refs.push({
      type: "campaign",
      provider,
      name: campaign.name,
    });

    if (provider === "google" && "ad_groups" in campaign && campaign.ad_groups) {
      for (const adGroup of campaign.ad_groups) {
        refs.push({
          type: "ad_group",
          provider,
          name: adGroup.name,
          parent: campaignRef,
        });

        if (adGroup.ads) {
          for (const ad of adGroup.ads) {
            const adName = "headlines" in ad ? ad.headlines[0] ?? "ad" : "ad";
            refs.push({
              type: "ad",
              provider,
              name: adName,
              parent: `${provider}:ad_group:${slugify(adGroup.name)}`,
            });
          }
        }

        if (adGroup.keywords) {
          for (const kw of adGroup.keywords) {
            refs.push({
              type: "keyword",
              provider,
              name: kw.text,
              parent: `${provider}:ad_group:${slugify(adGroup.name)}`,
            });
          }
        }
      }
    }

    if (provider === "meta" && "ad_sets" in campaign && campaign.ad_sets) {
      for (const adSet of campaign.ad_sets) {
        refs.push({
          type: "ad_set",
          provider,
          name: adSet.name,
          parent: campaignRef,
        });

        if (adSet.ads) {
          for (const ad of adSet.ads) {
            refs.push({
              type: "ad",
              provider,
              name: ad.name,
              parent: `${provider}:ad_set:${slugify(adSet.name)}`,
            });
          }
        }
      }
    }
  }

  return refs;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function resourceKey(provider: string, type: string, name: string): string {
  return `${provider}:${type}:${slugify(name)}`;
}
