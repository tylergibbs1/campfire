import type { MutateOperation } from "../client.ts";

export function createAdOp(
  adGroupResourceName: string,
  config: Record<string, unknown>,
): MutateOperation {
  const headlines = (config.headlines as string[]).map((text, i) => ({
    text,
    ...(i < 3 ? { pinnedField: `HEADLINE_${i + 1}` } : {}),
  }));

  const descriptions = (config.descriptions as string[]).map((text) => ({
    text,
  }));

  const ad: Record<string, unknown> = {
    responsiveSearchAd: {
      headlines,
      descriptions,
      path1: (config.path_parts as string[])?.[0],
      path2: (config.path_parts as string[])?.[1],
    },
    finalUrls: [config.final_url],
  };

  return {
    adGroupAdOperation: {
      create: {
        adGroup: adGroupResourceName,
        status: "ENABLED",
        ad,
      },
    },
  };
}

export function removeAdOp(resourceName: string): MutateOperation {
  return {
    adGroupAdOperation: { remove: resourceName },
  };
}
