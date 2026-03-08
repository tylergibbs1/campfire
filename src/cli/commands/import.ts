import { loadWorkspace } from "../../config/parser.ts";
import { createLocalStateManager } from "../../state/backends/local.ts";
import { initProviders } from "../providers.ts";
import { hashConfig } from "../../util/crypto.ts";
import { logger } from "../../util/logger.ts";
import { resourceKey } from "../../config/references.ts";
import chalk from "chalk";

export async function importCommand(
  type: string,
  remoteId: string,
): Promise<void> {
  // Parse type as "provider:resourceType" e.g. "google:campaign"
  const colonIdx = type.indexOf(":");
  if (colonIdx === -1) {
    logger.error(
      'Invalid resource type format. Use "provider:type" (e.g., "google:campaign", "meta:ad_set")',
    );
    process.exit(1);
  }

  const providerName = type.slice(0, colonIdx);
  const resourceType = type.slice(colonIdx + 1);

  const workspace = await loadWorkspace();
  const statePath =
    workspace.config.workspace.state?.path ?? ".campfire/state.json";
  const stateManager = createLocalStateManager(workspace.root, statePath);
  await stateManager.load();

  const providers = await initProviders(workspace.config, workspace.root);
  const provider = providers.get(providerName);

  if (!provider) {
    logger.error(
      `Provider "${providerName}" is not configured or failed to authenticate. Check your campfire.yml providers section.`,
    );
    process.exit(1);
  }

  logger.info(`Fetching ${type} ${remoteId} from ${providerName}...`);

  const remote = await provider.get(resourceType, remoteId);
  if (!remote) {
    logger.error(`Resource not found: ${type} ${remoteId}`);
    process.exit(1);
  }

  // Generate a resource key from remote properties
  const props = remote.properties as Record<string, unknown>;
  const name =
    (props.name as string | undefined) ??
    remoteId;
  const key = resourceKey(providerName, resourceType, name);

  // Check if already tracked
  const existing = stateManager.getResource(key);
  if (existing) {
    logger.warn(`Resource "${key}" is already tracked in state.`);
    return;
  }

  // Add to state
  stateManager.setResource(key, {
    remote_id: remoteId,
    config_hash: hashConfig(props),
    last_synced: new Date().toISOString(),
    provider: providerName,
    metadata: props,
  });
  await stateManager.save();

  logger.success(`Imported ${key}`);

  // Print a config snippet
  console.log(chalk.gray("\nAdd this to your .camp.yml:\n"));
  console.log(chalk.cyan(generateConfigSnippet(providerName, resourceType, props)));
}

function generateConfigSnippet(
  provider: string,
  resourceType: string,
  properties: Record<string, unknown>,
): string {
  const indent = "    ";
  const lines: string[] = [];

  if (resourceType === "campaign") {
    lines.push("campaigns:");
    lines.push(`  - name: "${properties.name ?? "imported-campaign"}"`);
    lines.push(`    provider: ${provider}`);

    if (provider === "google") {
      lines.push(`    type: search # verify this`);
      lines.push(`    status: paused`);
    } else if (provider === "meta") {
      lines.push(`    objective: ${properties.objective ?? "conversions"}`);
      lines.push(`    status: PAUSED`);
    }
  } else {
    lines.push(`# Imported ${provider}:${resourceType}`);
    lines.push(`# Remote ID: ${properties.id ?? "unknown"}`);
    lines.push(`# Add the appropriate config to your .camp.yml`);
  }

  return lines.join("\n");
}
