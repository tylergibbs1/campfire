import { ProviderError } from "../../util/errors.ts";

export interface GoogleAuthConfig {
  credentials: string; // path to service account JSON or JSON string
  developer_token: string;
  customer_id: string;
  login_customer_id?: string;
}

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export class GoogleAuth {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private serviceAccount: ServiceAccountKey | null = null;

  constructor(private config: GoogleAuthConfig) {}

  get customerId(): string {
    return this.config.customer_id.replace(/-/g, "");
  }

  get developerToken(): string {
    return this.config.developer_token;
  }

  async authenticate(): Promise<void> {
    const creds = this.config.credentials;

    // Try as JSON string first, then as file path
    try {
      this.serviceAccount = JSON.parse(creds);
    } catch {
      try {
        const file = Bun.file(creds);
        if (!(await file.exists())) {
          throw new ProviderError(
            `Google credentials file not found: ${creds}`,
            "google",
          );
        }
        this.serviceAccount = await file.json();
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        throw new ProviderError(
          `Failed to load Google credentials: ${e instanceof Error ? e.message : String(e)}`,
          "google",
        );
      }
    }

    await this.refreshToken();
  }

  async getAccessToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry - 60_000) {
      await this.refreshToken();
    }
    return this.accessToken!;
  }

  private async refreshToken(): Promise<void> {
    if (!this.serviceAccount) {
      throw new ProviderError("Not authenticated. Call authenticate() first.", "google");
    }

    const jwt = await this.createJWT();
    const res = await fetch(this.serviceAccount.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new ProviderError(
        `Failed to get Google access token: ${res.status} ${body}`,
        "google",
      );
    }

    const data = (await res.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;
  }

  private async createJWT(): Promise<string> {
    const sa = this.serviceAccount!;
    const now = Math.floor(Date.now() / 1000);

    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/adwords",
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    };

    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToDer(sa.private_key),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(signingInput),
    );

    return `${signingInput}.${base64url(signature)}`;
  }
}

function base64url(input: string | ArrayBuffer): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
