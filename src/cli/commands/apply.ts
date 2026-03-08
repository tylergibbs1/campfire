import { loadWorkspace } from "../../config/parser.ts";
import { extractResourceRefs } from "../../config/references.ts";
import { flattenCampaigns } from "../../engine/resolve.ts";
import { computeChanges } from "../../engine/diff.ts";
import { buildExecutionPlan } from "../../engine/planner.ts";
import { executePlan, type ExecutionContext } from "../../engine/executor.ts";
import { createLocalStateManager } from "../../state/backends/local.ts";
import { initProviders } from "../providers.ts";
import { printPlan, printApplyResult } from "../output.ts";
import { logger } from "../../util/logger.ts";

export async function applyCommand(opts: {
  autoApprove?: boolean;
}): Promise<void> {
  const workspace = await loadWorkspace();
  const statePath =
    workspace.config.workspace.state?.path ?? ".campfire/state.json";
  const stateManager = createLocalStateManager(workspace.root, statePath);
  await stateManager.load();

  const configResources = flattenCampaigns(workspace.campaigns);
  const stateResources = new Map(
    stateManager.listResources().map(([key, res]) => [key, res] as const),
  );

  const changes = computeChanges(configResources, stateResources);
  const refs = extractResourceRefs(workspace.campaigns);
  const plan = buildExecutionPlan(changes, refs);

  printPlan(plan);

  const { toCreate, toUpdate, toDestroy } = plan.summary;
  if (toCreate === 0 && toUpdate === 0 && toDestroy === 0) {
    return;
  }

  if (!opts.autoApprove) {
    process.stdout.write("Do you want to apply these changes? (yes/no) ");
    const response = await readLine();
    if (response.trim().toLowerCase() !== "yes") {
      logger.info("Apply cancelled.");
      return;
    }
  }

  console.log();

  // Initialize providers from workspace config
  const providers = await initProviders(workspace.config, workspace.root);

  const ctx: ExecutionContext = {
    providers,
    stateManager,
    workspaceRoot: workspace.root,
  };

  const result = await executePlan(plan, ctx);
  printApplyResult(result);

  if (result.failed > 0) {
    process.exit(1);
  }
}

function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode?.(false);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.once("data", (data) => {
      stdin.pause();
      resolve(data.toString());
    });
  });
}
