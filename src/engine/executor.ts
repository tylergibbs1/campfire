import type { ExecutionPlan } from "./planner.ts";
import type { StateManager, ResourceState } from "../state/manager.ts";
import type { Provider } from "../providers/interface.ts";
import { hashConfig } from "../util/crypto.ts";
import { logger } from "../util/logger.ts";

export interface ExecutionResult {
  created: number;
  updated: number;
  destroyed: number;
  failed: number;
  errors: Array<{ key: string; error: string }>;
}

export interface ExecutionContext {
  providers: Map<string, Provider>;
  stateManager: StateManager;
  workspaceRoot: string;
}

/**
 * Execute a plan against providers.
 * Tracks parent→child resource ID relationships so children can reference
 * the remote IDs of their parents.
 */
export async function executePlan(
  plan: ExecutionPlan,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const result: ExecutionResult = {
    created: 0,
    updated: 0,
    destroyed: 0,
    failed: 0,
    errors: [],
  };

  // Map of resource key → remote ID (populated as creates succeed)
  const createdIds = new Map<string, string>();

  // Creates (parents first, thanks to topological sort)
  for (const change of plan.creates) {
    try {
      const provider = ctx.providers.get(change.provider);
      const desired = { ...change.desired! };

      if (provider) {
        // Inject parent remote IDs for child resources
        injectParentIds(desired, change, ctx.stateManager, createdIds);

        const remote = await provider.create(change.resourceType, desired);

        const resource: ResourceState = {
          remote_id: remote.id,
          config_hash: hashConfig(change.desired!),
          last_synced: new Date().toISOString(),
          provider: change.provider,
          metadata: { ...change.desired!, ...remote.properties },
        };
        ctx.stateManager.setResource(change.key, resource);
        createdIds.set(change.key, remote.id);
      } else {
        // No provider configured — local-only mode
        const resource: ResourceState = {
          remote_id: `pending:${change.key}`,
          config_hash: hashConfig(change.desired!),
          last_synced: new Date().toISOString(),
          provider: change.provider,
          metadata: change.desired ?? {},
        };
        ctx.stateManager.setResource(change.key, resource);
        createdIds.set(change.key, resource.remote_id);
      }

      await ctx.stateManager.save();
      logger.success(`Created ${change.key}`);
      result.created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to create ${change.key}: ${msg}`);
      result.failed++;
      result.errors.push({ key: change.key, error: msg });
      break;
    }
  }

  // Updates
  for (const change of plan.updates) {
    try {
      const provider = ctx.providers.get(change.provider);
      const existing = ctx.stateManager.getResource(change.key);

      if (provider && existing && !existing.remote_id.startsWith("pending:")) {
        const diff = {
          changes: (change.diff ?? []).map((d) => ({
            path: d.path,
            oldValue: d.oldValue,
            newValue: d.newValue,
          })),
        };

        await provider.update(change.resourceType, existing.remote_id, diff);
      }

      const resource: ResourceState = {
        remote_id: existing?.remote_id ?? `pending:${change.key}`,
        config_hash: hashConfig(change.desired!),
        last_synced: new Date().toISOString(),
        provider: change.provider,
        metadata: { ...(existing?.metadata ?? {}), ...change.desired! },
      };
      ctx.stateManager.setResource(change.key, resource);
      await ctx.stateManager.save();
      logger.success(`Updated ${change.key}`);
      result.updated++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to update ${change.key}: ${msg}`);
      result.failed++;
      result.errors.push({ key: change.key, error: msg });
      break;
    }
  }

  // Deletes (children first, thanks to reverse topological sort)
  for (const change of plan.deletes) {
    try {
      const provider = ctx.providers.get(change.provider);
      const existing = ctx.stateManager.getResource(change.key);

      if (provider && existing && !existing.remote_id.startsWith("pending:")) {
        await provider.delete(change.resourceType, existing.remote_id);
      }

      ctx.stateManager.removeResource(change.key);
      await ctx.stateManager.save();
      logger.success(`Destroyed ${change.key}`);
      result.destroyed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to destroy ${change.key}: ${msg}`);
      result.failed++;
      result.errors.push({ key: change.key, error: msg });
      break;
    }
  }

  return result;
}

/**
 * Inject parent resource remote IDs into child resource config
 * so providers can reference them in API calls.
 */
function injectParentIds(
  desired: Record<string, unknown>,
  change: { key: string; resourceType: string; provider: string },
  stateManager: StateManager,
  createdIds: Map<string, string>,
): void {
  const { resourceType, provider } = change;

  if (provider === "google") {
    if (resourceType === "ad_group") {
      const campaignName = desired.campaign as string;
      const campaignKey = findParentKey(stateManager, createdIds, provider, "campaign", campaignName);
      if (campaignKey) {
        desired._campaignResourceName = getRemoteId(stateManager, createdIds, campaignKey);
      }
    }

    if (resourceType === "ad" || resourceType === "keyword") {
      const adGroupName = desired.ad_group as string;
      const adGroupKey = findParentKey(stateManager, createdIds, provider, "ad_group", adGroupName);
      if (adGroupKey) {
        desired._adGroupResourceName = getRemoteId(stateManager, createdIds, adGroupKey);
      }
    }
  }

  if (provider === "meta") {
    if (resourceType === "ad_set") {
      const campaignName = desired.campaign as string;
      const campaignKey = findParentKey(stateManager, createdIds, provider, "campaign", campaignName);
      if (campaignKey) {
        desired._campaignRemoteId = getRemoteId(stateManager, createdIds, campaignKey);
      }
    }

    if (resourceType === "ad") {
      const adSetName = desired.ad_set as string;
      const adSetKey = findParentKey(stateManager, createdIds, provider, "ad_set", adSetName);
      if (adSetKey) {
        desired._adSetRemoteId = getRemoteId(stateManager, createdIds, adSetKey);
      }
    }
  }
}

function findParentKey(
  stateManager: StateManager,
  createdIds: Map<string, string>,
  provider: string,
  parentType: string,
  parentName: string,
): string | null {
  // Check createdIds first (just-created in this apply)
  for (const key of createdIds.keys()) {
    if (key.startsWith(`${provider}:${parentType}:`) && matchesName(key, parentName)) {
      return key;
    }
  }

  // Check existing state
  for (const [key] of stateManager.listResources()) {
    if (key.startsWith(`${provider}:${parentType}:`) && matchesName(key, parentName)) {
      return key;
    }
  }

  return null;
}

function matchesName(key: string, name: string): boolean {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return key.endsWith(`:${slug}`);
}

function getRemoteId(
  stateManager: StateManager,
  createdIds: Map<string, string>,
  key: string,
): string {
  // Prefer just-created ID
  if (createdIds.has(key)) {
    return createdIds.get(key)!;
  }
  // Fall back to state
  const state = stateManager.getResource(key);
  return state?.remote_id ?? "";
}
