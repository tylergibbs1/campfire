import { createHash } from "crypto";

export function hashConfig(config: unknown): string {
  const json = stableStringify(config);
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map(
    (k) =>
      JSON.stringify(k) +
      ":" +
      stableStringify((value as Record<string, unknown>)[k]),
  );
  return "{" + parts.join(",") + "}";
}
