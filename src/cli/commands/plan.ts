import { resolve } from "path";
import { loadWorkspace } from "../../config/parser.ts";
import { extractResourceRefs } from "../../config/references.ts";
import { flattenCampaigns } from "../../engine/resolve.ts";
import { computeChanges } from "../../engine/diff.ts";
import { buildExecutionPlan, type ExecutionPlan } from "../../engine/planner.ts";
import { createLocalStateManager } from "../../state/backends/local.ts";
import { printPlan } from "../output.ts";

export async function planCommand(): Promise<ExecutionPlan> {
  const workspace = await loadWorkspace();
  const statePath =
    workspace.config.workspace.state?.path ?? ".campfire/state.json";
  const stateManager = createLocalStateManager(workspace.root, statePath);
  await stateManager.load();

  // Flatten config into resources
  const configResources = flattenCampaigns(workspace.campaigns);

  // Get state resources
  const stateResources = new Map(
    stateManager
      .listResources()
      .map(([key, res]) => [key, res] as const),
  );

  // Compute diff
  const changes = computeChanges(configResources, stateResources);

  // Build resource refs for dependency ordering
  const refs = extractResourceRefs(workspace.campaigns);

  // Build execution plan
  const plan = buildExecutionPlan(changes, refs);

  // Print plan
  printPlan(plan);

  return plan;
}
