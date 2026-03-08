import { ConfigError } from "../util/errors.ts";

export type Variables = Record<string, string | number | boolean>;

const ENV_VAR_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)}/g;
const USER_VAR_PATTERN = /\$\{var\.([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;

export function resolveVariables(obj: unknown, vars: Variables): unknown {
  if (typeof obj === "string") {
    return resolveString(obj, vars);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveVariables(item, vars));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveVariables(value, vars);
    }
    return result;
  }
  return obj;
}

function resolveString(str: string, vars: Variables): string | number | boolean {
  // Check if the entire string is a single variable reference (preserve type)
  const fullEnvMatch = str.match(/^\$\{([A-Z_][A-Z0-9_]*)\}$/);
  if (fullEnvMatch) {
    const envName = fullEnvMatch[1]!;
    const val = process.env[envName];
    if (val === undefined) {
      throw new ConfigError(`Environment variable "${envName}" is not set`);
    }
    return val;
  }

  const fullVarMatch = str.match(/^\$\{var\.([a-zA-Z_][a-zA-Z0-9_.]*)\}$/);
  if (fullVarMatch) {
    const varName = fullVarMatch[1]!;
    const val = vars[varName];
    if (val === undefined) {
      throw new ConfigError(`Variable "var.${varName}" is not defined`);
    }
    return val;
  }

  // Inline interpolation (always returns string)
  let result = str.replace(ENV_VAR_PATTERN, (_, name: string) => {
    const val = process.env[name];
    if (val === undefined) {
      throw new ConfigError(`Environment variable "${name}" is not set`);
    }
    return val;
  });

  result = result.replace(USER_VAR_PATTERN, (_, name: string) => {
    const val = vars[name];
    if (val === undefined) {
      throw new ConfigError(`Variable "var.${name}" is not defined`);
    }
    return String(val);
  });

  return result;
}

export function collectUndefinedVars(
  obj: unknown,
  vars: Variables,
): string[] {
  const missing: string[] = [];

  function walk(value: unknown) {
    if (typeof value === "string") {
      for (const match of value.matchAll(ENV_VAR_PATTERN)) {
        const name = match[1]!;
        if (process.env[name] === undefined) {
          missing.push(`$\{${name}}`);
        }
      }
      for (const match of value.matchAll(USER_VAR_PATTERN)) {
        const name = match[1]!;
        if (vars[name] === undefined) {
          missing.push(`$\{var.${name}}`);
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value !== null && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  }

  walk(obj);
  return [...new Set(missing)];
}
