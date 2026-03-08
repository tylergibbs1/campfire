import type { ResourceChange } from "./diff.ts";
import { ResourceGraph } from "./graph.ts";
import type { ResourceRef } from "../config/references.ts";

export interface ExecutionPlan {
  creates: ResourceChange[];
  updates: ResourceChange[];
  deletes: ResourceChange[];
  noChanges: ResourceChange[];
  summary: {
    toCreate: number;
    toUpdate: number;
    toDestroy: number;
  };
}

export function buildExecutionPlan(
  changes: ResourceChange[],
  refs: ResourceRef[],
): ExecutionPlan {
  const graph = new ResourceGraph();
  for (const ref of refs) {
    graph.addRef(ref);
  }

  const topoOrder = graph.topologicalOrder();
  const reverseOrder = graph.reverseTopologicalOrder();

  const creates = changes
    .filter((c) => c.type === "create")
    .sort((a, b) => topoOrder.indexOf(a.key) - topoOrder.indexOf(b.key));

  const updates = changes.filter((c) => c.type === "update");

  const deletes = changes
    .filter((c) => c.type === "delete")
    .sort((a, b) => reverseOrder.indexOf(a.key) - reverseOrder.indexOf(b.key));

  const noChanges = changes.filter((c) => c.type === "no_change");

  return {
    creates,
    updates,
    deletes,
    noChanges,
    summary: {
      toCreate: creates.length,
      toUpdate: updates.length,
      toDestroy: deletes.length,
    },
  };
}
