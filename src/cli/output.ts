import chalk from "chalk";
import type { ExecutionPlan } from "../engine/planner.ts";
import type { ResourceChange, PropertyDiff } from "../engine/diff.ts";
import type { ExecutionResult } from "../engine/executor.ts";

export function printPlanHeader(): void {
  console.log();
}

export function printPlan(plan: ExecutionPlan): void {
  const { creates, updates, deletes, summary } = plan;

  if (summary.toCreate === 0 && summary.toUpdate === 0 && summary.toDestroy === 0) {
    console.log(chalk.green("\nNo changes. Infrastructure is up-to-date.\n"));
    return;
  }

  console.log(
    `\nPlan: ${chalk.green(`${summary.toCreate} to create`)}, ${chalk.yellow(`${summary.toUpdate} to update`)}, ${chalk.red(`${summary.toDestroy} to destroy`)}\n`,
  );

  for (const change of creates) {
    printCreate(change);
  }
  for (const change of updates) {
    printUpdate(change);
  }
  for (const change of deletes) {
    printDelete(change);
  }
}

function printCreate(change: ResourceChange): void {
  console.log(chalk.green(`  + ${change.key}`));
  if (change.desired) {
    printProperties(change.desired, "    ", chalk.green);
  }
  console.log();
}

function printUpdate(change: ResourceChange): void {
  console.log(chalk.yellow(`  ~ ${change.key}`));
  if (change.diff) {
    for (const d of change.diff) {
      const old = formatValue(d.oldValue);
      const next = formatValue(d.newValue);
      console.log(
        `    ${d.path}: ${chalk.red(old)} ${chalk.gray("→")} ${chalk.green(next)}`,
      );
    }
  }
  console.log();
}

function printDelete(change: ResourceChange): void {
  console.log(chalk.red(`  - ${change.key}`));
  console.log();
}

function printProperties(
  obj: Record<string, unknown>,
  indent: string,
  colorFn: (s: string) => string,
): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      console.log(colorFn(`${indent}${key}:`));
      printProperties(value as Record<string, unknown>, indent + "  ", colorFn);
    } else {
      console.log(colorFn(`${indent}${key}: ${formatValue(value)}`));
    }
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return "(not set)";
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function printApplyResult(result: ExecutionResult): void {
  console.log();
  const parts: string[] = [];
  if (result.created > 0) parts.push(chalk.green(`${result.created} created`));
  if (result.updated > 0) parts.push(chalk.yellow(`${result.updated} updated`));
  if (result.destroyed > 0) parts.push(chalk.red(`${result.destroyed} destroyed`));
  if (result.failed > 0) parts.push(chalk.redBright(`${result.failed} failed`));

  if (parts.length === 0) {
    console.log(chalk.green("Apply complete. No changes made."));
  } else {
    console.log(`Apply complete: ${parts.join(", ")}.`);
  }

  if (result.errors.length > 0) {
    console.log(chalk.red("\nErrors:"));
    for (const err of result.errors) {
      console.log(chalk.red(`  ${err.key}: ${err.error}`));
    }
  }
  console.log();
}

export function printStateList(
  resources: Array<[string, { remote_id: string; provider: string; last_synced: string }]>,
): void {
  if (resources.length === 0) {
    console.log("\nNo resources tracked in state.\n");
    return;
  }

  console.log(`\n${resources.length} resource(s) in state:\n`);
  for (const [key, res] of resources) {
    console.log(`  ${chalk.cyan(key)}`);
    console.log(`    provider:    ${res.provider}`);
    console.log(`    remote_id:   ${res.remote_id}`);
    console.log(`    last_synced: ${res.last_synced}`);
    console.log();
  }
}
