import { GoogleAuth } from "./auth.ts";
import { ProviderError } from "../../util/errors.ts";
import { logger } from "../../util/logger.ts";

const API_VERSION = "v21";
const BASE_URL = `https://googleads.googleapis.com/${API_VERSION}`;

export interface MutateOperation {
  [key: string]: {
    create?: Record<string, unknown>;
    update?: Record<string, unknown>;
    remove?: string;
    update_mask?: string;
  };
}

export interface MutateResponse {
  mutateOperationResponses: Array<{
    campaignBudgetResult?: { resourceName: string };
    campaignResult?: { resourceName: string };
    adGroupResult?: { resourceName: string };
    adGroupAdResult?: { resourceName: string };
    adGroupCriterionResult?: { resourceName: string };
    campaignCriterionResult?: { resourceName: string };
  }>;
  partialFailureError?: {
    code: number;
    message: string;
    details: unknown[];
  };
}

export interface SearchResponse {
  results: Array<Record<string, unknown>>;
  totalResultsCount?: string;
}

export class GoogleAdsClient {
  constructor(private auth: GoogleAuth) {}

  async mutate(operations: MutateOperation[]): Promise<MutateResponse> {
    const url = `${BASE_URL}/customers/${this.auth.customerId}/googleAds:mutate`;
    const body = { mutateOperations: operations };

    logger.debug(`Google mutate: ${operations.length} operations`);

    const res = await this.request("POST", url, body);
    return res as MutateResponse;
  }

  async search(query: string): Promise<SearchResponse> {
    const url = `${BASE_URL}/customers/${this.auth.customerId}/googleAds:search`;
    const body = { query };

    const res = await this.request("POST", url, body);
    return res as SearchResponse;
  }

  async get(resourceName: string): Promise<Record<string, unknown> | null> {
    // Use search to get a single resource
    // Resource name format: customers/123/campaigns/456
    const parts = resourceName.split("/");
    const resourceType = parts[2] ?? ""; // campaigns, adGroups, etc.

    // Map resource name to GAQL resource type
    const gaqlType = resourceType
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/^_/, "")
      .replace(/s$/, ""); // campaigns -> campaign

    const query = `SELECT ${gaqlType}.resource_name FROM ${gaqlType} WHERE ${gaqlType}.resource_name = '${resourceName}' LIMIT 1`;

    try {
      const res = await this.search(query);
      if (res.results && res.results.length > 0) {
        return res.results[0] ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async request(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<unknown> {
    const token = await this.auth.getAccessToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "developer-token": this.auth.developerToken,
      "Content-Type": "application/json",
    };

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.ok) {
        return res.json();
      }

      // Rate limit — retry with backoff
      if (res.status === 429) {
        const wait = Math.min(1000 * Math.pow(2, attempts), 30000);
        logger.debug(`Rate limited, waiting ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      const errorBody = await res.text();
      let errorMessage = `Google Ads API error (${res.status})`;

      try {
        const parsed = JSON.parse(errorBody);
        if (parsed.error?.message) {
          errorMessage = parsed.error.message;
        }
        if (parsed.error?.details) {
          const details = parsed.error.details;
          for (const detail of details) {
            if (detail.errors) {
              for (const err of detail.errors) {
                errorMessage += `\n  ${err.message || JSON.stringify(err.errorCode)}`;
              }
            }
          }
        }
      } catch {
        errorMessage += `: ${errorBody}`;
      }

      throw new ProviderError(errorMessage, "google", errorBody);
    }

    throw new ProviderError("Max retries exceeded", "google");
  }
}
