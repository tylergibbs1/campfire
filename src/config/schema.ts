import { z } from "zod/v4";

// --- Shared schemas ---

export const budgetSchema = z.object({
  amount: z.union([z.number(), z.string()]),
  period: z.enum(["daily", "lifetime"]).default("daily"),
  delivery: z.enum(["standard", "accelerated"]).optional(),
});

export const biddingSchema = z.object({
  strategy: z.string(),
  target_cpa: z.union([z.number(), z.string()]).optional(),
  target_roas: z.union([z.number(), z.string()]).optional(),
  max_cpc: z.union([z.number(), z.string()]).optional(),
});

// --- Google Ads schemas ---

export const keywordSchema = z.object({
  text: z.string(),
  match_type: z.enum(["broad", "phrase", "exact"]),
  negative: z.boolean().optional().default(false),
});

export const responsiveSearchAdSchema = z.object({
  type: z.literal("responsive_search"),
  headlines: z.array(z.string()).min(1).max(15),
  descriptions: z.array(z.string()).min(1).max(4),
  final_url: z.string(),
  path_parts: z.array(z.string()).max(2).optional(),
});

export const googleAdSchema = z.discriminatedUnion("type", [
  responsiveSearchAdSchema,
]);

export const googleAdGroupSchema = z.object({
  name: z.string(),
  cpc_bid: z.union([z.number(), z.string()]).optional(),
  keywords: z.array(keywordSchema).optional(),
  ads: z.array(googleAdSchema).optional(),
});

export const googleCampaignSchema = z.object({
  name: z.string(),
  provider: z.literal("google"),
  type: z.enum(["search", "display", "shopping", "performance_max"]),
  status: z.enum(["enabled", "paused", "removed"]).default("paused"),
  budget: budgetSchema.optional(),
  bidding: biddingSchema.optional(),
  geo_targets: z.array(z.string()).optional(),
  ad_groups: z.array(googleAdGroupSchema).optional(),
});

// --- Meta Ads schemas ---

export const metaTargetingSchema = z.object({
  custom_audiences: z
    .array(z.object({ ref: z.string() }))
    .optional(),
  age_min: z.number().optional(),
  age_max: z.number().optional(),
  genders: z.array(z.union([z.literal("all"), z.literal("male"), z.literal("female")])).optional(),
  geo_locations: z
    .object({
      countries: z.array(z.string()).optional(),
      cities: z.array(z.string()).optional(),
    })
    .optional(),
  publisher_platforms: z.array(z.string()).optional(),
  placements: z.record(z.string(), z.array(z.string())).optional(),
});

export const metaCreativeCardSchema = z.object({
  image: z.string(),
  headline: z.string(),
  link: z.string().optional(),
  description: z.string().optional(),
});

export const metaAdSchema = z.object({
  name: z.string(),
  type: z.enum(["image", "video", "carousel"]),
  creative: z.object({
    image: z.string().optional(),
    video: z.string().optional(),
    cards: z.array(metaCreativeCardSchema).optional(),
    body: z.string().optional(),
    headline: z.string().optional(),
    call_to_action: z.string().optional(),
    link: z.string().optional(),
  }),
});

export const metaAdSetSchema = z.object({
  name: z.string(),
  budget: budgetSchema.optional(),
  optimization_goal: z.string().optional(),
  billing_event: z.string().optional(),
  targeting: metaTargetingSchema.optional(),
  ads: z.array(metaAdSchema).optional(),
});

export const metaCampaignSchema = z.object({
  name: z.string(),
  provider: z.literal("meta"),
  objective: z.string(),
  status: z.enum(["ACTIVE", "PAUSED", "paused", "active"]).default("PAUSED"),
  special_ad_categories: z.array(z.string()).optional(),
  ad_sets: z.array(metaAdSetSchema).optional(),
});

// --- Unified campaign schema ---

export const campaignSchema = z.union([googleCampaignSchema, metaCampaignSchema]);

// --- Campaign file schema ---

export const campaignFileSchema = z.object({
  campaigns: z.array(campaignSchema),
});

// --- Provider config schemas ---

export const googleProviderSchema = z.object({
  credentials: z.string(),
  developer_token: z.string(),
  customer_id: z.string(),
});

export const metaProviderSchema = z.object({
  access_token: z.string(),
  ad_account_id: z.string(),
});

export const providersSchema = z.object({
  google: googleProviderSchema.optional(),
  meta: metaProviderSchema.optional(),
});

// --- Workspace config ---

export const stateConfigSchema = z.object({
  backend: z.enum(["local", "s3", "gcs"]).default("local"),
  path: z.string().default(".campfire/state.json"),
});

export const workspaceSchema = z.object({
  name: z.string(),
  state: stateConfigSchema.optional(),
});

export const workspaceFileSchema = z.object({
  workspace: workspaceSchema,
  providers: providersSchema.optional(),
});

// --- Variables file schema ---

export const varsFileSchema = z.object({
  vars: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

// --- Types ---

export type WorkspaceConfig = z.infer<typeof workspaceFileSchema>;
export type CampaignFile = z.infer<typeof campaignFileSchema>;
export type GoogleCampaign = z.infer<typeof googleCampaignSchema>;
export type MetaCampaign = z.infer<typeof metaCampaignSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type VarsFile = z.infer<typeof varsFileSchema>;
export type Budget = z.infer<typeof budgetSchema>;
