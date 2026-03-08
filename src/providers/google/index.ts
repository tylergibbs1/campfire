import type {
  Provider,
  ProviderConfig,
  RemoteResource,
  ResourceConfig,
  ValidationResult,
  PlatformPayload,
  Diff,
  MutateOperation as ProviderMutateOp,
  MutateResult as ProviderMutateResult,
} from "../interface.ts";
import { GoogleAuth, type GoogleAuthConfig } from "./auth.ts";
import { GoogleAdsClient, type MutateOperation } from "./client.ts";
import { extractId } from "./mapping.ts";
import { createBudgetOp, updateBudgetOp } from "./resources/budget.ts";
import {
  createCampaignOp,
  updateCampaignOp,
  removeCampaignOp,
  createGeoTargetOps,
} from "./resources/campaign.ts";
import {
  createAdGroupOp,
  updateAdGroupOp,
  removeAdGroupOp,
} from "./resources/ad-group.ts";
import { createAdOp, removeAdOp } from "./resources/ad.ts";
import { createKeywordOp, removeKeywordOp } from "./resources/keyword.ts";
import { ProviderError } from "../../util/errors.ts";
import { logger } from "../../util/logger.ts";

// Temp resource IDs for batch cross-referencing (negative IDs)
let tempIdCounter = -1;
function nextTempId(): string {
  return String(tempIdCounter--);
}

export function resetTempIds(): void {
  tempIdCounter = -1;
}

export class GoogleProvider implements Provider {
  name = "google";
  private auth!: GoogleAuth;
  private client!: GoogleAdsClient;

  async authenticate(config: ProviderConfig): Promise<void> {
    const authConfig: GoogleAuthConfig = {
      credentials: config.credentials as string,
      developer_token: config.developer_token as string,
      customer_id: config.customer_id as string,
      login_customer_id: config.login_customer_id as string | undefined,
    };

    this.auth = new GoogleAuth(authConfig);
    this.client = new GoogleAdsClient(this.auth);
    await this.auth.authenticate();
    logger.debug("Google Ads authenticated");
  }

  async get(
    resourceType: string,
    remoteId: string,
  ): Promise<RemoteResource | null> {
    const result = await this.client.get(remoteId);
    if (!result) return null;
    return {
      id: remoteId,
      type: resourceType,
      properties: result,
    };
  }

  async create(
    resourceType: string,
    desired: ResourceConfig,
  ): Promise<RemoteResource> {
    resetTempIds();
    const customerId = this.auth.customerId;
    const operations: MutateOperation[] = [];

    switch (resourceType) {
      case "campaign": {
        // Create budget + campaign + geo targets in one batch
        const budgetTempId = nextTempId();
        const campaignTempId = nextTempId();
        const budgetResourceName = `customers/${customerId}/campaignBudgets/${budgetTempId}`;
        const campaignResourceName = `customers/${customerId}/campaigns/${campaignTempId}`;

        if (desired.budget) {
          operations.push(createBudgetOp(customerId, budgetTempId, desired));
        }
        operations.push(
          createCampaignOp(customerId, campaignTempId, budgetResourceName, desired),
        );

        if (desired.geo_targets && Array.isArray(desired.geo_targets)) {
          operations.push(
            ...createGeoTargetOps(
              customerId,
              campaignResourceName,
              desired.geo_targets as string[],
            ),
          );
        }

        const res = await this.client.mutate(operations);
        const campaignResult = res.mutateOperationResponses?.find(
          (r) => r.campaignResult,
        );
        const resourceName =
          campaignResult?.campaignResult?.resourceName ??
          `customers/${customerId}/campaigns/unknown`;

        // Store budget resource name in metadata for future updates
        const budgetResult = res.mutateOperationResponses?.find(
          (r) => r.campaignBudgetResult,
        );

        return {
          id: resourceName,
          type: "campaign",
          properties: {
            ...desired,
            _budgetResourceName: budgetResult?.campaignBudgetResult?.resourceName,
          },
        };
      }

      case "ad_group": {
        const tempId = nextTempId();
        // Look up campaign resource name from state metadata
        const campaignResourceName =
          (desired._campaignResourceName as string) ??
          `customers/${customerId}/campaigns/unknown`;

        operations.push(
          createAdGroupOp(customerId, tempId, campaignResourceName, desired),
        );

        const res = await this.client.mutate(operations);
        const result = res.mutateOperationResponses?.find(
          (r) => r.adGroupResult,
        );
        const resourceName =
          result?.adGroupResult?.resourceName ??
          `customers/${customerId}/adGroups/unknown`;

        return {
          id: resourceName,
          type: "ad_group",
          properties: desired,
        };
      }

      case "ad": {
        const adGroupResourceName =
          (desired._adGroupResourceName as string) ??
          `customers/${customerId}/adGroups/unknown`;

        operations.push(createAdOp(adGroupResourceName, desired));

        const res = await this.client.mutate(operations);
        const result = res.mutateOperationResponses?.find(
          (r) => r.adGroupAdResult,
        );
        const resourceName =
          result?.adGroupAdResult?.resourceName ??
          `customers/${customerId}/adGroupAds/unknown`;

        return {
          id: resourceName,
          type: "ad",
          properties: desired,
        };
      }

      case "keyword": {
        const adGroupResourceName =
          (desired._adGroupResourceName as string) ??
          `customers/${customerId}/adGroups/unknown`;

        operations.push(createKeywordOp(adGroupResourceName, desired));

        const res = await this.client.mutate(operations);
        const result = res.mutateOperationResponses?.find(
          (r) => r.adGroupCriterionResult,
        );
        const resourceName =
          result?.adGroupCriterionResult?.resourceName ??
          `customers/${customerId}/adGroupCriteria/unknown`;

        return {
          id: resourceName,
          type: "keyword",
          properties: desired,
        };
      }

      default:
        throw new ProviderError(
          `Unsupported resource type: ${resourceType}`,
          "google",
        );
    }
  }

  async update(
    resourceType: string,
    remoteId: string,
    changes: Diff,
  ): Promise<RemoteResource> {
    const operations: MutateOperation[] = [];
    const changedFields = Object.fromEntries(
      changes.changes.map((c) => [c.path, c.newValue]),
    );

    switch (resourceType) {
      case "campaign": {
        // Handle budget updates separately
        if (changedFields["budget.amount"] !== undefined) {
          const budgetResourceName = changedFields._budgetResourceName as string;
          if (budgetResourceName) {
            operations.push(
              updateBudgetOp(budgetResourceName, {
                amount: changedFields["budget.amount"] as number,
              }),
            );
          }
        }

        operations.push(updateCampaignOp(remoteId, changedFields));
        break;
      }

      case "ad_group": {
        operations.push(updateAdGroupOp(remoteId, changedFields));
        break;
      }

      case "ad": {
        // Ads can't be updated in Google — remove and recreate
        operations.push(removeAdOp(remoteId));
        // The executor will handle recreation
        break;
      }

      default:
        throw new ProviderError(
          `Update not supported for resource type: ${resourceType}`,
          "google",
        );
    }

    if (operations.length > 0) {
      await this.client.mutate(operations);
    }

    return {
      id: remoteId,
      type: resourceType,
      properties: changedFields,
    };
  }

  async delete(resourceType: string, remoteId: string): Promise<void> {
    const operations: MutateOperation[] = [];

    switch (resourceType) {
      case "campaign":
        operations.push(removeCampaignOp(remoteId));
        break;
      case "ad_group":
        operations.push(removeAdGroupOp(remoteId));
        break;
      case "ad":
        operations.push(removeAdOp(remoteId));
        break;
      case "keyword":
        operations.push(removeKeywordOp(remoteId));
        break;
      default:
        throw new ProviderError(
          `Delete not supported for resource type: ${resourceType}`,
          "google",
        );
    }

    await this.client.mutate(operations);
  }

  async batchMutate(
    operations: ProviderMutateOp[],
  ): Promise<ProviderMutateResult[]> {
    // Convert generic operations to Google-specific format
    // This is a simplified pass-through for now
    const googleOps: MutateOperation[] = [];

    for (const op of operations) {
      if (op.type === "delete" && op.resourceId) {
        switch (op.resourceType) {
          case "campaign":
            googleOps.push(removeCampaignOp(op.resourceId));
            break;
          case "ad_group":
            googleOps.push(removeAdGroupOp(op.resourceId));
            break;
          case "ad":
            googleOps.push(removeAdOp(op.resourceId));
            break;
          case "keyword":
            googleOps.push(removeKeywordOp(op.resourceId));
            break;
        }
      }
    }

    if (googleOps.length > 0) {
      await this.client.mutate(googleOps);
    }

    return operations.map(() => ({ success: true }));
  }

  validateResource(
    resourceType: string,
    config: ResourceConfig,
  ): ValidationResult {
    const errors: Array<{ path: string; message: string }> = [];

    switch (resourceType) {
      case "campaign":
        if (!config.name) errors.push({ path: "name", message: "Required" });
        if (!config.type) errors.push({ path: "type", message: "Required" });
        break;
      case "ad_group":
        if (!config.name) errors.push({ path: "name", message: "Required" });
        break;
      case "ad":
        if (!config.headlines || !(config.headlines as unknown[]).length)
          errors.push({ path: "headlines", message: "At least 1 headline required" });
        if (!config.descriptions || !(config.descriptions as unknown[]).length)
          errors.push({ path: "descriptions", message: "At least 1 description required" });
        if (!config.final_url)
          errors.push({ path: "final_url", message: "Required" });
        break;
      case "keyword":
        if (!config.text) errors.push({ path: "text", message: "Required" });
        if (!config.match_type) errors.push({ path: "match_type", message: "Required" });
        break;
    }

    return { valid: errors.length === 0, errors };
  }

  mapConfig(resourceType: string, config: ResourceConfig): PlatformPayload {
    // Direct pass-through — mapping happens in create/update methods
    return config as PlatformPayload;
  }
}
