import { ProviderError } from "../../util/errors.ts";

export interface MetaAuthConfig {
  access_token: string;
  ad_account_id: string;
}

export class MetaAuth {
  private _accessToken: string = "";
  private _adAccountId: string = "";

  constructor(private config: MetaAuthConfig) {}

  get accessToken(): string {
    return this._accessToken;
  }

  get adAccountId(): string {
    return this._adAccountId;
  }

  async authenticate(): Promise<void> {
    this._accessToken = this.config.access_token;
    this._adAccountId = this.config.ad_account_id;

    // Validate the token by making a simple API call
    const res = await fetch(
      `https://graph.facebook.com/v24.0/${this._adAccountId}?fields=id,name,account_status&access_token=${this._accessToken}`,
    );

    if (!res.ok) {
      const body = await res.text();
      throw new ProviderError(
        `Meta authentication failed: ${res.status} ${body}`,
        "meta",
      );
    }
  }
}
