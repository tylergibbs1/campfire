import type { GoogleAdsClient, MutateOperation } from "../client.ts";
import { toMicros } from "../mapping.ts";

export function createBudgetOp(
  customerId: string,
  tempId: string,
  config: Record<string, unknown>,
): MutateOperation {
  const budget = config.budget as { amount: number | string; period?: string; delivery?: string } | undefined;
  if (!budget) {
    throw new Error("Campaign budget is required");
  }

  const campaignBudget: Record<string, unknown> = {
    resourceName: `customers/${customerId}/campaignBudgets/${tempId}`,
    amountMicros: toMicros(budget.amount),
    explicitlyShared: false,
  };

  if (budget.period === "daily") {
    // daily budget is the default
  } else if (budget.period === "lifetime") {
    campaignBudget.totalAmountMicros = toMicros(budget.amount);
    delete campaignBudget.amountMicros;
  }

  if (budget.delivery === "accelerated") {
    campaignBudget.deliveryMethod = "ACCELERATED";
  }

  return {
    campaignBudgetOperation: { create: campaignBudget },
  };
}

export function updateBudgetOp(
  budgetResourceName: string,
  budget: { amount: number | string; period?: string },
): MutateOperation {
  return {
    campaignBudgetOperation: {
      update: {
        resourceName: budgetResourceName,
        amountMicros: toMicros(budget.amount),
      },
      update_mask: "amount_micros",
    },
  };
}
