import { resolve } from "path";
import { logger } from "../../util/logger.ts";

const DEFAULT_WORKSPACE = `workspace:
  name: "my-ads"
  state:
    backend: local
    path: ".campfire/state.json"

# providers:
#   google:
#     credentials: "\${GOOGLE_ADS_CREDENTIALS}"
#     developer_token: "\${GOOGLE_ADS_DEV_TOKEN}"
#     customer_id: "123-456-7890"
#   meta:
#     access_token: "\${META_ACCESS_TOKEN}"
#     ad_account_id: "act_123456789"
`;

const EXAMPLE_CAMPAIGN = `campaigns:
  - name: "Example Campaign — Search"
    provider: google
    type: search
    status: paused
    budget:
      amount: 10.00
      period: daily
    bidding:
      strategy: maximize_conversions
    geo_targets:
      - US
    ad_groups:
      - name: "Example Ad Group"
        cpc_bid: 1.00
        keywords:
          - text: "example keyword"
            match_type: broad
        ads:
          - type: responsive_search
            headlines:
              - "Example Headline 1"
              - "Example Headline 2"
              - "Example Headline 3"
            descriptions:
              - "Example description for your ad."
              - "Another example description."
            final_url: "https://example.com"
`;

const GITIGNORE = `.campfire/
`;

export async function initCommand(): Promise<void> {
  const root = process.cwd();

  const workspacePath = resolve(root, "campfire.yml");
  if (await Bun.file(workspacePath).exists()) {
    logger.warn("campfire.yml already exists. Skipping init.");
    return;
  }

  await Bun.write(workspacePath, DEFAULT_WORKSPACE);
  logger.success("Created campfire.yml");

  const campaignsDir = resolve(root, "campaigns");
  await Bun.write(
    resolve(campaignsDir, "example.camp.yml"),
    EXAMPLE_CAMPAIGN,
  );
  logger.success("Created campaigns/example.camp.yml");

  // Append to .gitignore if it exists, otherwise create it
  const gitignorePath = resolve(root, ".gitignore");
  const gitignoreFile = Bun.file(gitignorePath);
  if (await gitignoreFile.exists()) {
    const existing = await gitignoreFile.text();
    if (!existing.includes(".campfire/")) {
      await Bun.write(gitignorePath, existing + "\n" + GITIGNORE);
      logger.success("Added .campfire/ to .gitignore");
    }
  } else {
    await Bun.write(gitignorePath, GITIGNORE);
    logger.success("Created .gitignore");
  }

  console.log(
    "\nWorkspace initialized. Edit campfire.yml and campaigns/*.camp.yml, then run:\n" +
      "  campfire validate\n" +
      "  campfire plan\n",
  );
}
