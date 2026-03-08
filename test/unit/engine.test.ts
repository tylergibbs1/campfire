import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { resolve } from "path";
import { rm, mkdir } from "fs/promises";
import { loadWorkspace } from "../../src/config/parser.ts";
import { flattenCampaigns } from "../../src/engine/resolve.ts";
import { computeChanges } from "../../src/engine/diff.ts";
import { buildExecutionPlan } from "../../src/engine/planner.ts";
import { extractResourceRefs } from "../../src/config/references.ts";
import { ResourceGraph } from "../../src/engine/graph.ts";
import { StateManager } from "../../src/state/manager.ts";
import { hashConfig } from "../../src/util/crypto.ts";

const FIXTURES = resolve(import.meta.dir, "../fixtures");
const TMP_STATE = resolve(import.meta.dir, "../tmp/.campfire/state.json");

describe("resource flattening", () => {
  test("flattens campaigns into resources", async () => {
    const workspace = await loadWorkspace(FIXTURES);
    const resources = flattenCampaigns(workspace.campaigns);

    expect(resources.size).toBeGreaterThan(0);

    // Should have campaigns, ad groups, ads, keywords, ad sets
    const types = new Set([...resources.values()].map((r) => r.type));
    expect(types.has("campaign")).toBe(true);
    expect(types.has("ad_group")).toBe(true);
    expect(types.has("ad")).toBe(true);
    expect(types.has("keyword")).toBe(true);
    expect(types.has("ad_set")).toBe(true);
  });
});

describe("diff engine", () => {
  test("detects creates when state is empty", async () => {
    const workspace = await loadWorkspace(FIXTURES);
    const configResources = flattenCampaigns(workspace.campaigns);
    const stateResources = new Map();

    const changes = computeChanges(configResources, stateResources);
    const creates = changes.filter((c) => c.type === "create");

    expect(creates.length).toBe(configResources.size);
  });

  test("detects deletes when config is empty", () => {
    const configResources = new Map();
    const stateResources = new Map([
      [
        "google:campaign:old",
        {
          remote_id: "123",
          config_hash: "abc",
          last_synced: "2026-01-01T00:00:00Z",
          provider: "google",
          metadata: { name: "old" },
        },
      ],
    ]);

    const changes = computeChanges(configResources, stateResources);
    const deletes = changes.filter((c) => c.type === "delete");

    expect(deletes.length).toBe(1);
    expect(deletes[0]!.key).toBe("google:campaign:old");
  });

  test("detects updates when config hash differs", () => {
    const config = { name: "Test", status: "enabled" };
    const configResources = new Map([
      [
        "google:campaign:test",
        { provider: "google", type: "campaign", name: "Test", config },
      ],
    ]);

    const stateResources = new Map([
      [
        "google:campaign:test",
        {
          remote_id: "123",
          config_hash: "different-hash",
          last_synced: "2026-01-01T00:00:00Z",
          provider: "google",
          metadata: { name: "Test", status: "paused" },
        },
      ],
    ]);

    const changes = computeChanges(configResources, stateResources);
    const updates = changes.filter((c) => c.type === "update");

    expect(updates.length).toBe(1);
    expect(updates[0]!.diff!.length).toBeGreaterThan(0);
  });

  test("detects no changes when hash matches", () => {
    const config = { name: "Test", status: "paused" };
    const configResources = new Map([
      [
        "google:campaign:test",
        { provider: "google", type: "campaign", name: "Test", config },
      ],
    ]);

    const stateResources = new Map([
      [
        "google:campaign:test",
        {
          remote_id: "123",
          config_hash: hashConfig(config),
          last_synced: "2026-01-01T00:00:00Z",
          provider: "google",
          metadata: config,
        },
      ],
    ]);

    const changes = computeChanges(configResources, stateResources);
    const noChange = changes.filter((c) => c.type === "no_change");

    expect(noChange.length).toBe(1);
  });
});

describe("execution planner", () => {
  test("builds plan with correct counts", async () => {
    const workspace = await loadWorkspace(FIXTURES);
    const configResources = flattenCampaigns(workspace.campaigns);
    const stateResources = new Map();

    const changes = computeChanges(configResources, stateResources);
    const refs = extractResourceRefs(workspace.campaigns);
    const plan = buildExecutionPlan(changes, refs);

    expect(plan.summary.toCreate).toBe(configResources.size);
    expect(plan.summary.toUpdate).toBe(0);
    expect(plan.summary.toDestroy).toBe(0);
  });

  test("orders creates parents before children", async () => {
    const workspace = await loadWorkspace(FIXTURES);
    const configResources = flattenCampaigns(workspace.campaigns);
    const stateResources = new Map();

    const changes = computeChanges(configResources, stateResources);
    const refs = extractResourceRefs(workspace.campaigns);
    const plan = buildExecutionPlan(changes, refs);

    // Find campaign and ad group indices
    const campaignIdx = plan.creates.findIndex(
      (c) => c.resourceType === "campaign" && c.provider === "google",
    );
    const adGroupIdx = plan.creates.findIndex(
      (c) => c.resourceType === "ad_group",
    );

    if (campaignIdx !== -1 && adGroupIdx !== -1) {
      expect(campaignIdx).toBeLessThan(adGroupIdx);
    }
  });
});

describe("dependency graph", () => {
  test("topological order respects dependencies", () => {
    const graph = new ResourceGraph();

    graph.addRef({ type: "campaign", provider: "google", name: "camp1" });
    graph.addRef({
      type: "ad_group",
      provider: "google",
      name: "ag1",
      parent: "google:campaign:camp1",
    });
    graph.addRef({
      type: "ad",
      provider: "google",
      name: "ad1",
      parent: "google:ad_group:ag1",
    });

    const order = graph.topologicalOrder();
    const campIdx = order.indexOf("google:campaign:camp1");
    const agIdx = order.indexOf("google:ad_group:ag1");
    const adIdx = order.indexOf("google:ad:ad1");

    expect(campIdx).toBeLessThan(agIdx);
    expect(agIdx).toBeLessThan(adIdx);
  });

  test("reverse order for deletes", () => {
    const graph = new ResourceGraph();

    graph.addRef({ type: "campaign", provider: "google", name: "camp1" });
    graph.addRef({
      type: "ad_group",
      provider: "google",
      name: "ag1",
      parent: "google:campaign:camp1",
    });

    const order = graph.reverseTopologicalOrder();
    const campIdx = order.indexOf("google:campaign:camp1");
    const agIdx = order.indexOf("google:ad_group:ag1");

    expect(agIdx).toBeLessThan(campIdx);
  });
});

describe("state manager", () => {
  beforeEach(async () => {
    await mkdir(resolve(TMP_STATE, ".."), { recursive: true });
  });

  afterEach(async () => {
    await rm(resolve(import.meta.dir, "../tmp"), {
      recursive: true,
      force: true,
    });
  });

  test("creates empty state when file doesn't exist", async () => {
    const manager = new StateManager(TMP_STATE);
    const state = await manager.load();

    expect(state.version).toBe(1);
    expect(Object.keys(state.resources)).toHaveLength(0);
  });

  test("saves and loads state", async () => {
    const manager = new StateManager(TMP_STATE);
    await manager.load();

    manager.setResource("google:campaign:test", {
      remote_id: "123",
      config_hash: "abc",
      last_synced: "2026-01-01T00:00:00Z",
      provider: "google",
      metadata: {},
    });

    await manager.save();

    const manager2 = new StateManager(TMP_STATE);
    const state = await manager2.load();
    expect(state.resources["google:campaign:test"]).toBeDefined();
    expect(state.resources["google:campaign:test"]!.remote_id).toBe("123");
  });

  test("removes resources", async () => {
    const manager = new StateManager(TMP_STATE);
    await manager.load();

    manager.setResource("google:campaign:test", {
      remote_id: "123",
      config_hash: "abc",
      last_synced: "2026-01-01T00:00:00Z",
      provider: "google",
      metadata: {},
    });

    manager.removeResource("google:campaign:test");
    expect(manager.getResource("google:campaign:test")).toBeUndefined();
  });
});
