import type { MutateOperation } from "../client.ts";
import { mapMatchType } from "../mapping.ts";

export function createKeywordOp(
  adGroupResourceName: string,
  config: Record<string, unknown>,
): MutateOperation {
  const criterion: Record<string, unknown> = {
    adGroup: adGroupResourceName,
    keyword: {
      text: config.text,
      matchType: mapMatchType(config.match_type as string),
    },
  };

  if (config.negative) {
    criterion.negative = true;
  }

  return {
    adGroupCriterionOperation: { create: criterion },
  };
}

export function removeKeywordOp(resourceName: string): MutateOperation {
  return {
    adGroupCriterionOperation: { remove: resourceName },
  };
}
