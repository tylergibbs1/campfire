# campfire

Terraform for ads. Define ad campaigns as YAML, then `plan` and `apply` changes to Google Ads and Meta Ads via their APIs.

```
campfire plan

Plan: 2 to create, 1 to update, 0 to destroy

  + google:campaign "Spring Sale 2026 — Search"
      type: search
      status: paused
      budget: $50.00/day

  + google:ad_group "Running Shoes — Broad"
      cpc_bid: $2.50

  ~ meta:ad_set "Website Visitors — 30d"
      budget: $25.00/day → $30.00/day
      age_max: 50 → 55

Do you want to apply these changes? (yes/no)
```

## Why

Managing ad campaigns across platforms is a manual, error-prone, UI-clicking slog. No version control. No diffs. No code review for campaign changes. No way to spin up identical structures across accounts or roll back a bad change.

Infra teams solved this years ago with Terraform. campfire brings the same workflow to ad ops.

## Install

Requires [Bun](https://bun.sh) v1.0+.

```sh
git clone https://github.com/tylergibbs1/campfire.git
cd campfire
bun install
```

Run the CLI during development:

```sh
bun run src/cli/index.ts <command>
```

## Quick Start

```sh
# Initialize a workspace
campfire init

# Edit campfire.yml with your provider credentials
# Edit campaigns/*.camp.yml with your campaign config

# Validate config
campfire validate

# Preview changes
campfire plan

# Apply changes
campfire apply

# Check state
campfire state list
```

## Config

### Workspace (`campfire.yml`)

```yaml
workspace:
  name: "my-ads"
  state:
    backend: local
    path: ".campfire/state.json"

providers:
  google:
    credentials: "${GOOGLE_ADS_CREDENTIALS}"  # path to service account JSON
    developer_token: "${GOOGLE_ADS_DEV_TOKEN}"
    customer_id: "123-456-7890"
  meta:
    access_token: "${META_ACCESS_TOKEN}"
    ad_account_id: "act_123456789"
```

### Campaigns (`*.camp.yml`)

**Google Ads:**

```yaml
campaigns:
  - name: "Spring Sale — Search"
    provider: google
    type: search
    status: paused
    budget:
      amount: 50.00
      period: daily
    bidding:
      strategy: maximize_conversions
      target_cpa: 15.00
    geo_targets:
      - US
      - CA
    ad_groups:
      - name: "Running Shoes"
        cpc_bid: 2.50
        keywords:
          - text: "running shoes"
            match_type: broad
          - text: "cheap running shoes"
            match_type: broad
            negative: true
        ads:
          - type: responsive_search
            headlines:
              - "Spring Running Sale"
              - "20% Off All Running Shoes"
              - "Free Shipping Over $50"
            descriptions:
              - "Shop our spring collection."
              - "Limited time offer."
            final_url: "https://example.com/spring-sale"
```

**Meta Ads:**

```yaml
campaigns:
  - name: "Retargeting — Meta"
    provider: meta
    objective: conversions
    status: paused
    ad_sets:
      - name: "Website Visitors — 30d"
        budget:
          amount: 30.00
          period: daily
        optimization_goal: offsite_conversions
        billing_event: impressions
        targeting:
          age_min: 25
          age_max: 55
          genders: [all]
          geo_locations:
            countries: ["US"]
          publisher_platforms: ["facebook", "instagram"]
          placements:
            facebook: ["feed", "stories"]
            instagram: ["feed", "stories", "reels"]
        ads:
          - name: "Spring Carousel"
            type: carousel
            creative:
              cards:
                - image: "./assets/shoe-1.jpg"
                  headline: "Running Shoes"
                  link: "https://example.com/running"
                - image: "./assets/shoe-2.jpg"
                  headline: "Trail Shoes"
                  link: "https://example.com/trail"
              body: "Your spring lineup is waiting."
              call_to_action: "SHOP_NOW"
```

### Variables

```yaml
# vars/production.yml
vars:
  daily_budget: 100.00
  target_cpa: 12.00

# In campaign files:
budget:
  amount: "${var.daily_budget}"
```

Environment variables: `${ENV_VAR_NAME}`. User variables: `${var.name}`.

## CLI Reference

| Command | Description |
|---------|-------------|
| `campfire init` | Initialize workspace |
| `campfire validate` | Validate config syntax and references |
| `campfire plan` | Show what would change (dry run) |
| `campfire apply` | Apply changes to platforms |
| `campfire apply --auto-approve` | Apply without confirmation |
| `campfire destroy` | Remove all managed resources |
| `campfire import <type> <id>` | Import existing resource (e.g. `google:campaign 123`) |
| `campfire state list` | Show tracked resources |
| `campfire state rm <key>` | Remove resource from state |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success / no changes |
| 1 | Error |
| 2 | Plan has changes (useful for CI drift detection) |

## Providers

### Google Ads

- **API:** Google Ads REST API v21
- **Auth:** Service account JSON + developer token
- **Resources:** Campaign, Ad Group, Responsive Search Ad, Keywords (positive + negative), Budget, Geo Targeting
- **Features:** Batch mutate (campaign + budget + geo targets in one API call), bidding strategies (maximize conversions, manual CPC, target CPA/ROAS)

### Meta Ads

- **API:** Graph API v24.0
- **Auth:** System user access token
- **Resources:** Campaign, Ad Set, Ad (image + carousel)
- **Features:** Image upload from local files, targeting (geo, age, gender, placements, custom audiences), optimization goals

Both providers gracefully degrade — if credentials aren't configured, campfire runs in **local-only mode** (tracks state without making API calls). This is useful for testing config changes before connecting to real accounts.

## How It Works

1. **Config** — YAML files define your campaign hierarchy
2. **State** — JSON file maps local config to remote platform resource IDs
3. **Plan** — Three-way diff: config vs state vs remote (config vs state in current version)
4. **Apply** — Execute changes in dependency order (campaigns → ad groups → ads), save state after each operation
5. **Destroy** — Delete in reverse order (ads → ad groups → campaigns)

The executor resolves parent→child relationships automatically. When creating an ad group, it looks up the campaign's remote ID from state and passes it to the API call.

## Development

```sh
bun test              # Run tests (62 tests)
bun run src/cli/index.ts plan   # Run CLI
```

## Project Structure

```
src/
├── cli/           # CLI commands and output formatting
├── config/        # YAML parsing, Zod schemas, variables
├── state/         # State management
├── engine/        # Diff, planner, executor, dependency graph
├── providers/
│   ├── google/    # Google Ads API client and resource CRUD
│   └── meta/      # Meta Marketing API client and resource CRUD
└── util/          # Logger, errors, crypto
```

## Roadmap

- [x] **M0:** CLI, config parsing, state management, diff engine
- [x] **M1:** Google Ads provider
- [x] **M2:** Meta Ads provider
- [ ] **M3:** Drift detection (remote state refresh), S3/GCS state backends, CI integration
- [ ] **M4:** TikTok Ads, LinkedIn Ads providers

## License

MIT
