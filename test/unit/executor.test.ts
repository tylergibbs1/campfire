import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { resolve } from "path";
import { rm, mkdir } from "fs/promises";
import { executePlan, type ExecutionContext } from "../../src/engine/executor.ts";
import type { ExecutionPlan } from "../../src/engine/planner.ts";
import type { Provider, RemoteResource, Diff } from "../../src/providers/interface.ts";
import { StateManager } from "../../src/state/manager.ts";

const TMP_DIR = resolve(import.meta.dir, "../tmp-executor");
const TMP_STATE = resolve(TMP_DIR, ".campfire/state.json");

// Mock provider that records calls
class MockProvider implements Provider {
  name: string;
  calls: Array<{ method: string; args: unknown[] }> = [];
  private idCounter = 1;

  constructor(name: string) {
    this.name = name;
  }

  async authenticate() {}

  async get(): Promise<RemoteResource | null> {
    return null;
  }

  async create(resourceType: string, desired: Record<string, unknown>): Promise<RemoteResource> {
    const id = `remote-${this.idCounter++}`;
    this.calls.push({ method: "create", args: [resourceType, desired] });
    return { id, type: resourceType, properties: desired };
  }

  async update(resourceType: string, remoteId: string, changes: Diff): Promise<RemoteResource> {
    this.calls.push({ method: "update", args: [resourceType, remoteId, changes] });
    return { id: remoteId, type: resourceType, properties: {} };
  }

  async delete(resourceType: string, remoteId: string): Promise<void> {
    this.calls.push({ method: "delete", args: [resourceType, remoteId] });
  }

  validateResource() {
    return { valid: true, errors: [] };
  }

  mapConfig(_: string, config: Record<string, unknown>) {
    return config;
  }
}

describe("executor with providers", () => {
  let stateManager: StateManager;

  beforeEach(async () => {
    await mkdir(resolve(TMP_STATE, ".."), { recursive: true });
    stateManager = new StateManager(TMP_STATE);
    await stateManager.load();
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  test("calls provider.create for new resources", async () => {
    const mockGoogle = new MockProvider("google");

    const plan: ExecutionPlan = {
      creates: [
        {
          key: "google:campaign:test",
          type: "create",
          provider: "google",
          resourceType: "campaign",
          name: "Test",
          desired: { name: "Test", type: "search" },
        },
      ],
      updates: [],
      deletes: [],
      noChanges: [],
      summary: { toCreate: 1, toUpdate: 0, toDestroy: 0 },
    };

    const ctx: ExecutionContext = {
      providers: new Map([["google", mockGoogle]]),
      stateManager,
      workspaceRoot: TMP_DIR,
    };

    const result = await executePlan(plan, ctx);

    expect(result.created).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockGoogle.calls.length).toBe(1);
    expect(mockGoogle.calls[0]!.method).toBe("create");

    // State should have a real remote ID
    const state = stateManager.getResource("google:campaign:test");
    expect(state).toBeDefined();
    expect(state!.remote_id).toBe("remote-1");
  });

  test("passes parent IDs to child resources (google)", async () => {
    const mockGoogle = new MockProvider("google");

    // Pre-populate state with a campaign
    stateManager.setResource("google:campaign:test-campaign", {
      remote_id: "customers/123/campaigns/456",
      config_hash: "abc",
      last_synced: "2026-01-01T00:00:00Z",
      provider: "google",
      metadata: { name: "Test Campaign" },
    });

    const plan: ExecutionPlan = {
      creates: [
        {
          key: "google:ad_group:test-ad-group",
          type: "create",
          provider: "google",
          resourceType: "ad_group",
          name: "Test Ad Group",
          desired: {
            name: "Test Ad Group",
            cpc_bid: 2.5,
            campaign: "Test Campaign",
          },
        },
      ],
      updates: [],
      deletes: [],
      noChanges: [],
      summary: { toCreate: 1, toUpdate: 0, toDestroy: 0 },
    };

    const ctx: ExecutionContext = {
      providers: new Map([["google", mockGoogle]]),
      stateManager,
      workspaceRoot: TMP_DIR,
    };

    const result = await executePlan(plan, ctx);
    expect(result.created).toBe(1);

    // Check that the campaign resource name was injected
    const createCall = mockGoogle.calls[0]!;
    const desired = createCall.args[1] as Record<string, unknown>;
    expect(desired._campaignResourceName).toBe("customers/123/campaigns/456");
  });

  test("passes parent IDs to child resources (meta)", async () => {
    const mockMeta = new MockProvider("meta");

    stateManager.setResource("meta:campaign:test-meta", {
      remote_id: "campaign-789",
      config_hash: "abc",
      last_synced: "2026-01-01T00:00:00Z",
      provider: "meta",
      metadata: { name: "Test Meta" },
    });

    const plan: ExecutionPlan = {
      creates: [
        {
          key: "meta:ad_set:test-ad-set",
          type: "create",
          provider: "meta",
          resourceType: "ad_set",
          name: "Test Ad Set",
          desired: {
            name: "Test Ad Set",
            campaign: "Test Meta",
          },
        },
      ],
      updates: [],
      deletes: [],
      noChanges: [],
      summary: { toCreate: 1, toUpdate: 0, toDestroy: 0 },
    };

    const ctx: ExecutionContext = {
      providers: new Map([["meta", mockMeta]]),
      stateManager,
      workspaceRoot: TMP_DIR,
    };

    const result = await executePlan(plan, ctx);
    expect(result.created).toBe(1);

    const createCall = mockMeta.calls[0]!;
    const desired = createCall.args[1] as Record<string, unknown>;
    expect(desired._campaignRemoteId).toBe("campaign-789");
  });

  test("calls provider.update with diff", async () => {
    const mockGoogle = new MockProvider("google");

    stateManager.setResource("google:campaign:test", {
      remote_id: "customers/123/campaigns/456",
      config_hash: "old-hash",
      last_synced: "2026-01-01T00:00:00Z",
      provider: "google",
      metadata: { name: "Test", status: "paused" },
    });

    const plan: ExecutionPlan = {
      creates: [],
      updates: [
        {
          key: "google:campaign:test",
          type: "update",
          provider: "google",
          resourceType: "campaign",
          name: "Test",
          desired: { name: "Test", status: "enabled" },
          diff: [{ path: "status", oldValue: "paused", newValue: "enabled" }],
        },
      ],
      deletes: [],
      noChanges: [],
      summary: { toCreate: 0, toUpdate: 1, toDestroy: 0 },
    };

    const ctx: ExecutionContext = {
      providers: new Map([["google", mockGoogle]]),
      stateManager,
      workspaceRoot: TMP_DIR,
    };

    const result = await executePlan(plan, ctx);
    expect(result.updated).toBe(1);
    expect(mockGoogle.calls.length).toBe(1);
    expect(mockGoogle.calls[0]!.method).toBe("update");
  });

  test("calls provider.delete for removed resources", async () => {
    const mockGoogle = new MockProvider("google");

    stateManager.setResource("google:campaign:test", {
      remote_id: "customers/123/campaigns/456",
      config_hash: "hash",
      last_synced: "2026-01-01T00:00:00Z",
      provider: "google",
      metadata: {},
    });

    const plan: ExecutionPlan = {
      creates: [],
      updates: [],
      deletes: [
        {
          key: "google:campaign:test",
          type: "delete",
          provider: "google",
          resourceType: "campaign",
          name: "test",
        },
      ],
      noChanges: [],
      summary: { toCreate: 0, toUpdate: 0, toDestroy: 1 },
    };

    const ctx: ExecutionContext = {
      providers: new Map([["google", mockGoogle]]),
      stateManager,
      workspaceRoot: TMP_DIR,
    };

    const result = await executePlan(plan, ctx);
    expect(result.destroyed).toBe(1);
    expect(mockGoogle.calls[0]!.method).toBe("delete");
    expect(stateManager.getResource("google:campaign:test")).toBeUndefined();
  });

  test("falls back to local-only when no provider configured", async () => {
    const plan: ExecutionPlan = {
      creates: [
        {
          key: "google:campaign:test",
          type: "create",
          provider: "google",
          resourceType: "campaign",
          name: "Test",
          desired: { name: "Test" },
        },
      ],
      updates: [],
      deletes: [],
      noChanges: [],
      summary: { toCreate: 1, toUpdate: 0, toDestroy: 0 },
    };

    const ctx: ExecutionContext = {
      providers: new Map(), // No providers
      stateManager,
      workspaceRoot: TMP_DIR,
    };

    const result = await executePlan(plan, ctx);
    expect(result.created).toBe(1);

    const state = stateManager.getResource("google:campaign:test");
    expect(state!.remote_id).toStartWith("pending:");
  });
});
