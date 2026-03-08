import { test, expect, describe } from "bun:test";
import {
  toMicros,
  fromMicros,
  mapChannelType,
  mapStatus as googleMapStatus,
  mapMatchType,
  mapBiddingStrategy,
  geoTargetConstant,
  extractId,
} from "../../src/providers/google/mapping.ts";
import {
  toCents,
  fromCents,
  mapObjective,
  mapStatus as metaMapStatus,
  mapOptimizationGoal,
  mapBillingEvent,
  buildTargeting,
} from "../../src/providers/meta/mapping.ts";
import { createBudgetOp } from "../../src/providers/google/resources/budget.ts";
import { createCampaignOp, createGeoTargetOps } from "../../src/providers/google/resources/campaign.ts";
import { createAdGroupOp } from "../../src/providers/google/resources/ad-group.ts";
import { createAdOp } from "../../src/providers/google/resources/ad.ts";
import { createKeywordOp } from "../../src/providers/google/resources/keyword.ts";
import { GoogleProvider } from "../../src/providers/google/index.ts";
import { MetaProvider } from "../../src/providers/meta/index.ts";

describe("google mapping", () => {
  test("toMicros converts dollars to micros", () => {
    expect(toMicros(50)).toBe("50000000");
    expect(toMicros(1.5)).toBe("1500000");
    expect(toMicros("25.00")).toBe("25000000");
    expect(toMicros(0.01)).toBe("10000");
  });

  test("fromMicros converts micros to dollars", () => {
    expect(fromMicros("50000000")).toBe(50);
    expect(fromMicros(1500000)).toBe(1.5);
  });

  test("mapChannelType maps correctly", () => {
    expect(mapChannelType("search")).toBe("SEARCH");
    expect(mapChannelType("display")).toBe("DISPLAY");
    expect(mapChannelType("shopping")).toBe("SHOPPING");
    expect(mapChannelType("performance_max")).toBe("PERFORMANCE_MAX");
  });

  test("mapStatus maps correctly", () => {
    expect(googleMapStatus("enabled")).toBe("ENABLED");
    expect(googleMapStatus("paused")).toBe("PAUSED");
    expect(googleMapStatus("removed")).toBe("REMOVED");
  });

  test("mapMatchType maps correctly", () => {
    expect(mapMatchType("broad")).toBe("BROAD");
    expect(mapMatchType("phrase")).toBe("PHRASE");
    expect(mapMatchType("exact")).toBe("EXACT");
  });

  test("mapBiddingStrategy maps correctly", () => {
    expect(mapBiddingStrategy("maximize_conversions")).toBe("MAXIMIZE_CONVERSIONS");
    expect(mapBiddingStrategy("manual_cpc")).toBe("MANUAL_CPC");
  });

  test("geoTargetConstant returns known constants", () => {
    expect(geoTargetConstant("US")).toBe("2840");
    expect(geoTargetConstant("CA")).toBe("2124");
    expect(geoTargetConstant("GB")).toBe("2826");
    expect(geoTargetConstant("XX")).toBeUndefined();
  });

  test("extractId extracts last path segment", () => {
    expect(extractId("customers/123/campaigns/456")).toBe("456");
    expect(extractId("customers/123/adGroups/789")).toBe("789");
  });
});

describe("google resource operations", () => {
  test("createBudgetOp builds correct operation", () => {
    const op = createBudgetOp("123", "-1", {
      budget: { amount: 50, period: "daily" },
    });
    expect(op.campaignBudgetOperation).toBeDefined();
    const create = op.campaignBudgetOperation!.create!;
    expect(create.amountMicros).toBe("50000000");
    expect(create.resourceName).toBe("customers/123/campaignBudgets/-1");
  });

  test("createCampaignOp builds correct operation", () => {
    const op = createCampaignOp(
      "123",
      "-2",
      "customers/123/campaignBudgets/-1",
      { name: "Test Campaign", type: "search", status: "paused" },
    );
    expect(op.campaignOperation).toBeDefined();
    const create = op.campaignOperation!.create!;
    expect(create.name).toBe("Test Campaign");
    expect(create.advertisingChannelType).toBe("SEARCH");
    expect(create.status).toBe("PAUSED");
    expect(create.campaignBudget).toBe("customers/123/campaignBudgets/-1");
  });

  test("createGeoTargetOps builds ops for known countries", () => {
    const ops = createGeoTargetOps("123", "customers/123/campaigns/-2", [
      "US",
      "CA",
      "XX",
    ]);
    expect(ops.length).toBe(2); // XX is unknown, filtered out
    expect(ops[0]!.campaignCriterionOperation).toBeDefined();
  });

  test("createAdGroupOp builds correct operation", () => {
    const op = createAdGroupOp("123", "-3", "customers/123/campaigns/-2", {
      name: "Test Ad Group",
      cpc_bid: 2.5,
    });
    expect(op.adGroupOperation).toBeDefined();
    const create = op.adGroupOperation!.create!;
    expect(create.name).toBe("Test Ad Group");
    expect(create.cpcBidMicros).toBe("2500000");
  });

  test("createAdOp builds responsive search ad", () => {
    const op = createAdOp("customers/123/adGroups/-3", {
      type: "responsive_search",
      headlines: ["H1", "H2", "H3"],
      descriptions: ["D1", "D2"],
      final_url: "https://example.com",
      path_parts: ["path1", "path2"],
    });
    expect(op.adGroupAdOperation).toBeDefined();
    const create = op.adGroupAdOperation!.create!;
    expect(create.adGroup).toBe("customers/123/adGroups/-3");
    const ad = create.ad as Record<string, unknown>;
    expect(ad.finalUrls).toEqual(["https://example.com"]);
    const rsa = ad.responsiveSearchAd as Record<string, unknown>;
    expect((rsa.headlines as unknown[]).length).toBe(3);
  });

  test("createKeywordOp builds correct operation", () => {
    const op = createKeywordOp("customers/123/adGroups/-3", {
      text: "running shoes",
      match_type: "broad",
    });
    expect(op.adGroupCriterionOperation).toBeDefined();
    const create = op.adGroupCriterionOperation!.create!;
    expect(create.adGroup).toBe("customers/123/adGroups/-3");
    const keyword = create.keyword as Record<string, unknown>;
    expect(keyword.text).toBe("running shoes");
    expect(keyword.matchType).toBe("BROAD");
  });

  test("negative keyword op has negative flag", () => {
    const op = createKeywordOp("customers/123/adGroups/-3", {
      text: "free",
      match_type: "exact",
      negative: true,
    });
    const create = op.adGroupCriterionOperation!.create!;
    expect(create.negative).toBe(true);
  });
});

describe("meta mapping", () => {
  test("toCents converts dollars to cents", () => {
    expect(toCents(50)).toBe("5000");
    expect(toCents(1.5)).toBe("150");
    expect(toCents("25.00")).toBe("2500");
  });

  test("fromCents converts cents to dollars", () => {
    expect(fromCents("5000")).toBe(50);
    expect(fromCents(150)).toBe(1.5);
  });

  test("mapObjective maps correctly", () => {
    expect(mapObjective("conversions")).toBe("OUTCOME_SALES");
    expect(mapObjective("traffic")).toBe("OUTCOME_TRAFFIC");
    expect(mapObjective("awareness")).toBe("OUTCOME_AWARENESS");
  });

  test("mapStatus maps correctly", () => {
    expect(metaMapStatus("active")).toBe("ACTIVE");
    expect(metaMapStatus("paused")).toBe("PAUSED");
    expect(metaMapStatus("PAUSED")).toBe("PAUSED");
  });

  test("mapOptimizationGoal maps correctly", () => {
    expect(mapOptimizationGoal("offsite_conversions")).toBe("OFFSITE_CONVERSIONS");
    expect(mapOptimizationGoal("link_clicks")).toBe("LINK_CLICKS");
  });

  test("mapBillingEvent maps correctly", () => {
    expect(mapBillingEvent("impressions")).toBe("IMPRESSIONS");
    expect(mapBillingEvent("link_clicks")).toBe("LINK_CLICKS");
  });

  test("buildTargeting builds geo and age targeting", () => {
    const result = buildTargeting({
      geo_locations: { countries: ["US"] },
      age_min: 25,
      age_max: 55,
      genders: ["all"],
    });
    expect(result.geo_locations).toEqual({ countries: ["US"] });
    expect(result.age_min).toBe(25);
    expect(result.age_max).toBe(55);
    expect(result.genders).toBeUndefined(); // "all" is default, not sent
  });

  test("buildTargeting maps gendered targeting", () => {
    const result = buildTargeting({
      genders: ["male"],
    });
    expect(result.genders).toEqual([1]);
  });

  test("buildTargeting maps placements", () => {
    const result = buildTargeting({
      publisher_platforms: ["facebook", "instagram"],
      placements: {
        facebook: ["feed", "stories"],
        instagram: ["feed", "reels"],
      },
    });
    expect(result.publisher_platforms).toEqual(["facebook", "instagram"]);
    expect(result.facebook_positions).toEqual(["feed", "stories"]);
    expect(result.instagram_positions).toEqual(["feed", "reels"]);
  });
});

describe("provider instances", () => {
  test("GoogleProvider has correct name", () => {
    const provider = new GoogleProvider();
    expect(provider.name).toBe("google");
  });

  test("MetaProvider has correct name", () => {
    const provider = new MetaProvider();
    expect(provider.name).toBe("meta");
  });

  test("GoogleProvider validates campaign config", () => {
    const provider = new GoogleProvider();
    const valid = provider.validateResource("campaign", {
      name: "Test",
      type: "search",
    });
    expect(valid.valid).toBe(true);

    const invalid = provider.validateResource("campaign", {});
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  test("MetaProvider validates campaign config", () => {
    const provider = new MetaProvider();
    const valid = provider.validateResource("campaign", {
      name: "Test",
      objective: "conversions",
    });
    expect(valid.valid).toBe(true);

    const invalid = provider.validateResource("campaign", {});
    expect(invalid.valid).toBe(false);
  });

  test("GoogleProvider validates ad config", () => {
    const provider = new GoogleProvider();
    const valid = provider.validateResource("ad", {
      headlines: ["H1"],
      descriptions: ["D1"],
      final_url: "https://example.com",
    });
    expect(valid.valid).toBe(true);

    const invalid = provider.validateResource("ad", {
      headlines: [],
    });
    expect(invalid.valid).toBe(false);
  });
});
