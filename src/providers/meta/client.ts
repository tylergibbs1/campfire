import type { MetaAuth } from "./auth.ts";
import { ProviderError } from "../../util/errors.ts";
import { logger } from "../../util/logger.ts";

const API_VERSION = "v24.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export class MetaAdsClient {
  constructor(private auth: MetaAuth) {}

  async createCampaign(params: Record<string, unknown>): Promise<string> {
    const res = await this.post(
      `${this.auth.adAccountId}/campaigns`,
      params,
    );
    return res.id as string;
  }

  async updateCampaign(
    campaignId: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    await this.post(campaignId, params);
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    // Meta deprecated DELETE — use status update
    await this.post(campaignId, { status: "DELETED" });
  }

  async getCampaign(
    campaignId: string,
    fields: string[] = ["id", "name", "status", "objective"],
  ): Promise<Record<string, unknown> | null> {
    try {
      return await this.get(campaignId, fields);
    } catch {
      return null;
    }
  }

  async createAdSet(params: Record<string, unknown>): Promise<string> {
    const res = await this.post(
      `${this.auth.adAccountId}/adsets`,
      params,
    );
    return res.id as string;
  }

  async updateAdSet(
    adSetId: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    await this.post(adSetId, params);
  }

  async deleteAdSet(adSetId: string): Promise<void> {
    await this.post(adSetId, { status: "DELETED" });
  }

  async getAdSet(
    adSetId: string,
    fields: string[] = ["id", "name", "status", "daily_budget"],
  ): Promise<Record<string, unknown> | null> {
    try {
      return await this.get(adSetId, fields);
    } catch {
      return null;
    }
  }

  async createAd(params: Record<string, unknown>): Promise<string> {
    const res = await this.post(
      `${this.auth.adAccountId}/ads`,
      params,
    );
    return res.id as string;
  }

  async updateAd(
    adId: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    await this.post(adId, params);
  }

  async deleteAd(adId: string): Promise<void> {
    await this.request("DELETE", `${BASE_URL}/${adId}`, {
      access_token: this.auth.accessToken,
    });
  }

  async getAd(
    adId: string,
    fields: string[] = ["id", "name", "status"],
  ): Promise<Record<string, unknown> | null> {
    try {
      return await this.get(adId, fields);
    } catch {
      return null;
    }
  }

  async uploadImage(imagePath: string): Promise<string> {
    const file = Bun.file(imagePath);
    if (!(await file.exists())) {
      throw new ProviderError(`Image file not found: ${imagePath}`, "meta");
    }

    const formData = new FormData();
    formData.append("filename", new Blob([await file.arrayBuffer()]), imagePath.split("/").pop()!);
    formData.append("access_token", this.auth.accessToken);

    const res = await fetch(
      `${BASE_URL}/${this.auth.adAccountId}/adimages`,
      { method: "POST", body: formData },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new ProviderError(`Failed to upload image: ${body}`, "meta");
    }

    const data = await res.json() as { images: Record<string, { hash: string }> };
    const images = data.images;
    const firstKey = Object.keys(images)[0]!;
    return images[firstKey]!.hash;
  }

  private async post(
    endpoint: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const body = { ...params, access_token: this.auth.accessToken };
    return this.request("POST", `${BASE_URL}/${endpoint}`, body);
  }

  private async get(
    endpoint: string,
    fields: string[],
  ): Promise<Record<string, unknown>> {
    const params = new URLSearchParams({
      fields: fields.join(","),
      access_token: this.auth.accessToken,
    });
    return this.request("GET", `${BASE_URL}/${endpoint}?${params}`);
  }

  private async request(
    method: string,
    url: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;

      const options: RequestInit = { method };

      if (method === "POST" && body) {
        // Meta Graph API accepts form-encoded data
        const formData = new URLSearchParams();
        for (const [key, value] of Object.entries(body)) {
          if (value !== undefined && value !== null) {
            formData.append(
              key,
              typeof value === "object" ? JSON.stringify(value) : String(value),
            );
          }
        }
        options.body = formData;
        options.headers = {
          "Content-Type": "application/x-www-form-urlencoded",
        };
      }

      logger.debug(`Meta ${method} ${url}`);
      const res = await fetch(url, options);

      if (res.ok) {
        return (await res.json()) as Record<string, unknown>;
      }

      // Rate limit
      if (res.status === 429) {
        const wait = Math.min(1000 * Math.pow(2, attempts), 30000);
        logger.debug(`Rate limited, waiting ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      const errorBody = await res.text();
      let errorMessage = `Meta API error (${res.status})`;

      try {
        const parsed = JSON.parse(errorBody);
        if (parsed.error?.message) {
          errorMessage = `${parsed.error.type || "Error"}: ${parsed.error.message}`;
          if (parsed.error.error_user_msg) {
            errorMessage += `\n  ${parsed.error.error_user_msg}`;
          }
        }
      } catch {
        errorMessage += `: ${errorBody}`;
      }

      throw new ProviderError(errorMessage, "meta", errorBody);
    }

    throw new ProviderError("Max retries exceeded", "meta");
  }
}
