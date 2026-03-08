import type { Provider } from "../providers/interface.ts";
import type { WorkspaceConfig } from "../config/schema.ts";
import { GoogleProvider } from "../providers/google/index.ts";
import { MetaProvider } from "../providers/meta/index.ts";
import { logger } from "../util/logger.ts";

/**
 * Initialize and authenticate providers based on workspace config.
 * Returns a map of provider name → authenticated provider instance.
 * Providers without credentials in config are silently skipped.
 */
export async function initProviders(
  config: WorkspaceConfig,
  workspaceRoot: string,
): Promise<Map<string, Provider>> {
  const providers = new Map<string, Provider>();
  const providerConfig = config.providers;

  if (!providerConfig) {
    return providers;
  }

  // Google Ads
  if (providerConfig.google) {
    try {
      const google = new GoogleProvider();
      await google.authenticate({
        credentials: providerConfig.google.credentials,
        developer_token: providerConfig.google.developer_token,
        customer_id: providerConfig.google.customer_id,
      });
      providers.set("google", google);
      logger.success("Google Ads provider authenticated");
    } catch (e) {
      logger.warn(
        `Google Ads provider failed to authenticate: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Meta Ads
  if (providerConfig.meta) {
    try {
      const meta = new MetaProvider();
      await meta.authenticate({
        access_token: providerConfig.meta.access_token,
        ad_account_id: providerConfig.meta.ad_account_id,
        _workspaceRoot: workspaceRoot,
      });
      providers.set("meta", meta);
      logger.success("Meta Ads provider authenticated");
    } catch (e) {
      logger.warn(
        `Meta Ads provider failed to authenticate: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return providers;
}
