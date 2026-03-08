import type {
  Provider,
  ProviderConfig,
  RemoteResource,
  ResourceConfig,
  ValidationResult,
  PlatformPayload,
  Diff,
} from "../interface.ts";
import { MetaAuth, type MetaAuthConfig } from "./auth.ts";
import { MetaAdsClient } from "./client.ts";
import { ProviderError } from "../../util/errors.ts";
import { logger } from "../../util/logger.ts";
import {
  createCampaign,
  updateCampaign,
} from "./resources/campaign.ts";
import { createAdSet, updateAdSet } from "./resources/ad-set.ts";
import { createAd, updateAd } from "./resources/ad.ts";

export class MetaProvider implements Provider {
  name = "meta";
  private auth!: MetaAuth;
  private client!: MetaAdsClient;
  private workspaceRoot?: string;

  async authenticate(config: ProviderConfig): Promise<void> {
    const authConfig: MetaAuthConfig = {
      access_token: config.access_token as string,
      ad_account_id: config.ad_account_id as string,
    };

    this.auth = new MetaAuth(authConfig);
    this.client = new MetaAdsClient(this.auth);
    this.workspaceRoot = config._workspaceRoot as string | undefined;

    await this.auth.authenticate();
    logger.debug("Meta Ads authenticated");
  }

  async get(
    resourceType: string,
    remoteId: string,
  ): Promise<RemoteResource | null> {
    let result: Record<string, unknown> | null = null;

    switch (resourceType) {
      case "campaign":
        result = await this.client.getCampaign(remoteId);
        break;
      case "ad_set":
        result = await this.client.getAdSet(remoteId);
        break;
      case "ad":
        result = await this.client.getAd(remoteId);
        break;
    }

    if (!result) return null;
    return { id: remoteId, type: resourceType, properties: result };
  }

  async create(
    resourceType: string,
    desired: ResourceConfig,
  ): Promise<RemoteResource> {
    switch (resourceType) {
      case "campaign": {
        const id = await createCampaign(this.client, desired);
        return { id, type: "campaign", properties: desired };
      }

      case "ad_set": {
        const campaignId = desired._campaignRemoteId as string;
        if (!campaignId) {
          throw new ProviderError(
            "Ad set requires a campaign ID. Ensure the campaign is created first.",
            "meta",
          );
        }
        const id = await createAdSet(this.client, campaignId, desired);
        return { id, type: "ad_set", properties: desired };
      }

      case "ad": {
        const adSetId = desired._adSetRemoteId as string;
        if (!adSetId) {
          throw new ProviderError(
            "Ad requires an ad set ID. Ensure the ad set is created first.",
            "meta",
          );
        }
        const id = await createAd(
          this.client,
          adSetId,
          desired,
          this.workspaceRoot,
        );
        return { id, type: "ad", properties: desired };
      }

      default:
        throw new ProviderError(
          `Unsupported resource type: ${resourceType}`,
          "meta",
        );
    }
  }

  async update(
    resourceType: string,
    remoteId: string,
    changes: Diff,
  ): Promise<RemoteResource> {
    const changedFields = Object.fromEntries(
      changes.changes.map((c) => [c.path, c.newValue]),
    );

    switch (resourceType) {
      case "campaign":
        await updateCampaign(this.client, remoteId, changedFields);
        break;
      case "ad_set":
        await updateAdSet(this.client, remoteId, changedFields);
        break;
      case "ad":
        await updateAd(this.client, remoteId, changedFields);
        break;
      default:
        throw new ProviderError(
          `Update not supported for: ${resourceType}`,
          "meta",
        );
    }

    return { id: remoteId, type: resourceType, properties: changedFields };
  }

  async delete(resourceType: string, remoteId: string): Promise<void> {
    switch (resourceType) {
      case "campaign":
        await this.client.deleteCampaign(remoteId);
        break;
      case "ad_set":
        await this.client.deleteAdSet(remoteId);
        break;
      case "ad":
        await this.client.deleteAd(remoteId);
        break;
      default:
        throw new ProviderError(
          `Delete not supported for: ${resourceType}`,
          "meta",
        );
    }
  }

  validateResource(
    resourceType: string,
    config: ResourceConfig,
  ): ValidationResult {
    const errors: Array<{ path: string; message: string }> = [];

    switch (resourceType) {
      case "campaign":
        if (!config.name) errors.push({ path: "name", message: "Required" });
        if (!config.objective) errors.push({ path: "objective", message: "Required" });
        break;
      case "ad_set":
        if (!config.name) errors.push({ path: "name", message: "Required" });
        break;
      case "ad":
        if (!config.name) errors.push({ path: "name", message: "Required" });
        if (!config.creative) errors.push({ path: "creative", message: "Required" });
        break;
    }

    return { valid: errors.length === 0, errors };
  }

  mapConfig(resourceType: string, config: ResourceConfig): PlatformPayload {
    return config as PlatformPayload;
  }
}
