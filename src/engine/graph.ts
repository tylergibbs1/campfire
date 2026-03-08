import type { ResourceRef } from "../config/references.ts";
import { resourceKey } from "../config/references.ts";

export interface DependencyNode {
  key: string;
  ref: ResourceRef;
  dependencies: string[];
  dependents: string[];
}

export class ResourceGraph {
  private nodes = new Map<string, DependencyNode>();

  addRef(ref: ResourceRef): void {
    const key = resourceKey(ref.provider, ref.type, ref.name);
    if (!this.nodes.has(key)) {
      this.nodes.set(key, {
        key,
        ref,
        dependencies: [],
        dependents: [],
      });
    }

    if (ref.parent) {
      const node = this.nodes.get(key)!;
      if (!node.dependencies.includes(ref.parent)) {
        node.dependencies.push(ref.parent);
      }

      const parentNode = this.nodes.get(ref.parent);
      if (parentNode && !parentNode.dependents.includes(key)) {
        parentNode.dependents.push(key);
      }
    }
  }

  /**
   * Return keys in topological order (parents before children).
   * Used for create/update operations.
   */
  topologicalOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (key: string) => {
      if (visited.has(key)) return;
      visited.add(key);
      const node = this.nodes.get(key);
      if (!node) return;
      for (const dep of node.dependencies) {
        visit(dep);
      }
      result.push(key);
    };

    for (const key of this.nodes.keys()) {
      visit(key);
    }

    return result;
  }

  /**
   * Return keys in reverse topological order (children before parents).
   * Used for delete operations.
   */
  reverseTopologicalOrder(): string[] {
    return this.topologicalOrder().reverse();
  }

  getNode(key: string): DependencyNode | undefined {
    return this.nodes.get(key);
  }

  allKeys(): string[] {
    return [...this.nodes.keys()];
  }
}
