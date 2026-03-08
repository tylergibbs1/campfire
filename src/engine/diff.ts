import { hashConfig } from "../util/crypto.ts";
import type { ResourceState } from "../state/manager.ts";

export type ChangeType = "create" | "update" | "delete" | "no_change";

export interface ResourceChange {
  key: string;
  type: ChangeType;
  provider: string;
  resourceType: string;
  name: string;
  current?: Record<string, unknown>;
  desired?: Record<string, unknown>;
  diff?: PropertyDiff[];
}

export interface PropertyDiff {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Compute changes between local config and state.
 * In M0, we don't have remote state yet, so this is a two-way diff.
 */
export function computeChanges(
  configResources: Map<string, { provider: string; type: string; name: string; config: Record<string, unknown> }>,
  stateResources: Map<string, ResourceState>,
): ResourceChange[] {
  const changes: ResourceChange[] = [];
  const allKeys = new Set([...configResources.keys(), ...stateResources.keys()]);

  for (const key of allKeys) {
    const config = configResources.get(key);
    const state = stateResources.get(key);

    if (config && !state) {
      // Resource exists in config but not state → create
      changes.push({
        key,
        type: "create",
        provider: config.provider,
        resourceType: config.type,
        name: config.name,
        desired: config.config,
      });
    } else if (!config && state) {
      // Resource exists in state but not config → delete
      const parts = key.split(":");
      changes.push({
        key,
        type: "delete",
        provider: parts[0] ?? "",
        resourceType: parts[1] ?? "",
        name: parts.slice(2).join(":"),
        current: state.metadata,
      });
    } else if (config && state) {
      // Both exist → check if config has changed
      const currentHash = state.config_hash;
      const desiredHash = hashConfig(config.config);

      if (currentHash !== desiredHash) {
        const diff = diffObjects(state.metadata, config.config);
        changes.push({
          key,
          type: "update",
          provider: config.provider,
          resourceType: config.type,
          name: config.name,
          current: state.metadata,
          desired: config.config,
          diff,
        });
      } else {
        changes.push({
          key,
          type: "no_change",
          provider: config.provider,
          resourceType: config.type,
          name: config.name,
        });
      }
    }
  }

  return changes;
}

function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  prefix = "",
): PropertyDiff[] {
  const diffs: PropertyDiff[] = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (oldVal === undefined && newVal !== undefined) {
      diffs.push({ path, oldValue: undefined, newValue: newVal });
    } else if (oldVal !== undefined && newVal === undefined) {
      diffs.push({ path, oldValue: oldVal, newValue: undefined });
    } else if (
      typeof oldVal === "object" &&
      typeof newVal === "object" &&
      oldVal !== null &&
      newVal !== null &&
      !Array.isArray(oldVal) &&
      !Array.isArray(newVal)
    ) {
      diffs.push(
        ...diffObjects(
          oldVal as Record<string, unknown>,
          newVal as Record<string, unknown>,
          path,
        ),
      );
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ path, oldValue: oldVal, newValue: newVal });
    }
  }

  return diffs;
}
