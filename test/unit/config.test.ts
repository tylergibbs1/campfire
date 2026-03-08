import { test, expect, describe } from "bun:test";
import { resolve } from "path";
import { loadWorkspace } from "../../src/config/parser.ts";
import { resolveVariables, collectUndefinedVars } from "../../src/config/variables.ts";
import { extractResourceRefs, slugify, resourceKey } from "../../src/config/references.ts";
import {
  workspaceFileSchema,
  campaignFileSchema,
} from "../../src/config/schema.ts";

const FIXTURES = resolve(import.meta.dir, "../fixtures");

describe("config parser", () => {
  test("loads workspace from fixtures", async () => {
    const workspace = await loadWorkspace(FIXTURES);
    expect(workspace.config.workspace.name).toBe("test-workspace");
    expect(workspace.campaigns.campaigns.length).toBe(2);
  });

  test("parses google campaign", async () => {
    const workspace = await loadWorkspace(FIXTURES);
    const google = workspace.campaigns.campaigns.find(
      (c) => c.provider === "google",
    );
    expect(google).toBeDefined();
    expect(google!.name).toBe("Test Campaign — Search");
  });

  test("parses meta campaign", async () => {
    const workspace = await loadWorkspace(FIXTURES);
    const meta = workspace.campaigns.campaigns.find(
      (c) => c.provider === "meta",
    );
    expect(meta).toBeDefined();
    expect(meta!.name).toBe("Test Meta Campaign");
  });
});

describe("schema validation", () => {
  test("validates workspace config", () => {
    const result = workspaceFileSchema.safeParse({
      workspace: { name: "test" },
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid workspace config", () => {
    const result = workspaceFileSchema.safeParse({
      workspace: {},
    });
    expect(result.success).toBe(false);
  });

  test("validates google campaign", () => {
    const result = campaignFileSchema.safeParse({
      campaigns: [
        {
          name: "Test",
          provider: "google",
          type: "search",
          status: "paused",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("validates meta campaign", () => {
    const result = campaignFileSchema.safeParse({
      campaigns: [
        {
          name: "Test",
          provider: "meta",
          objective: "conversions",
          status: "paused",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("variables", () => {
  test("resolves user variables", () => {
    const result = resolveVariables(
      { key: "${var.budget}" },
      { budget: 100 },
    );
    expect(result).toEqual({ key: 100 });
  });

  test("resolves env variables", () => {
    process.env.TEST_CAMPFIRE_VAR = "hello";
    const result = resolveVariables(
      { key: "${TEST_CAMPFIRE_VAR}" },
      {},
    );
    expect(result).toEqual({ key: "hello" });
    delete process.env.TEST_CAMPFIRE_VAR;
  });

  test("throws on missing env var", () => {
    expect(() =>
      resolveVariables({ key: "${MISSING_VAR_XYZ}" }, {}),
    ).toThrow();
  });

  test("throws on missing user var", () => {
    expect(() =>
      resolveVariables({ key: "${var.missing}" }, {}),
    ).toThrow();
  });

  test("collects undefined variables", () => {
    const missing = collectUndefinedVars(
      { a: "${MISSING_A}", b: "${var.missing_b}" },
      {},
    );
    expect(missing.length).toBe(2);
  });
});

describe("references", () => {
  test("extracts resource refs from config", async () => {
    const workspace = await loadWorkspace(FIXTURES);
    const refs = extractResourceRefs(workspace.campaigns);
    expect(refs.length).toBeGreaterThan(0);

    const types = refs.map((r) => r.type);
    expect(types).toContain("campaign");
    expect(types).toContain("ad_group");
    expect(types).toContain("keyword");
    expect(types).toContain("ad_set");
    expect(types).toContain("ad");
  });

  test("slugifies names", () => {
    expect(slugify("Spring Sale 2026 — Search")).toBe("spring-sale-2026-search");
    expect(slugify("Running Shoes — Broad")).toBe("running-shoes-broad");
  });

  test("creates resource keys", () => {
    expect(resourceKey("google", "campaign", "Test Campaign")).toBe(
      "google:campaign:test-campaign",
    );
  });
});
