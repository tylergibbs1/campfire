# Campfire

Terraform for ads — manage ad campaigns as declarative YAML config, then plan/apply changes via platform APIs.

## Stack

- **Runtime:** Bun (not Node.js)
- **Language:** TypeScript (strict mode)
- **Config:** YAML (`.camp.yml` files)
- **Validation:** Zod v4 (import from `zod/v4`)
- **CLI:** Commander
- **Tests:** `bun test`

## Commands

```sh
bun run src/cli/index.ts <command>    # Run CLI during dev
bun test                              # Run tests
```

## Project Structure

- `src/cli/` — CLI entry point, commands, output formatting, provider initialization
- `src/config/` — YAML parsing, Zod schemas, variable interpolation, reference resolution
- `src/state/` — State file management (tracks local ↔ remote resource mapping)
- `src/engine/` — Diff engine, execution planner, dependency graph, resource flattening, executor
- `src/providers/` — Provider interface, registry, and implementations:
  - `src/providers/google/` — Google Ads REST API (v21): auth (service account JWT), client (batch mutate), resource CRUD (campaign, ad group, ad, keyword, budget, geo targets), config→API mapping
  - `src/providers/meta/` — Meta Marketing API (Graph API v24.0): auth (access token), client (REST), resource CRUD (campaign, ad set, ad), image upload, targeting builder
- `src/util/` — Logger, errors, crypto helpers
- `test/unit/` — Unit tests (62 tests across 4 files)
- `test/fixtures/` — Sample YAML configs for testing

## Conventions

- Use `Bun.file()` and `Bun.write()` for file I/O (not `node:fs`)
- Import with `.ts` extensions (`import { foo } from "./bar.ts"`)
- Config files use `.camp.yml` extension
- State lives at `.campfire/state.json` (gitignored)
- Resources are keyed as `provider:type:slugified-name`
- Exit code 2 from `plan` means changes detected (useful for CI)
- Google API uses micros ($1 = 1,000,000), Meta API uses cents ($1 = 100)
- Providers gracefully degrade: if no credentials configured, apply runs in local-only mode (state tracking without API calls)

## Architecture Notes

- **Executor** resolves parent→child resource IDs at apply time. When creating an ad group, it looks up the campaign's remote_id from state (or from just-created resources in the same apply) and injects it as `_campaignResourceName` (Google) or `_campaignRemoteId` (Meta).
- **Google provider** uses batch mutate (`GoogleAdsService.Mutate`) to create campaign + budget + geo targets in a single API call with temp resource IDs for cross-referencing.
- **Meta provider** makes sequential Graph API calls (campaign → ad set → ad) since Meta doesn't support batch mutations.

## Current Status: M0 + M1 + M2

Completed:
- M0: CLI, config, state, diff engine, planner, executor
- M1: Google Ads provider (auth, campaign/ad group/ad/keyword/budget/geo CRUD, batch mutate)
- M2: Meta Ads provider (auth, campaign/ad set/ad CRUD, image upload, targeting)
- Import command for existing platform resources

Next: M3 (Polish) — drift detection, S3/GCS state backends, improved errors, docs.
