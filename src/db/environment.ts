/** Database-free bootstrap for tools outside Next. Next owns its runtime environment. */
import { loadEnvConfig } from "@next/env";

export type EnvironmentMode = "development" | "production" | "test";

export class DatabaseConfigurationError extends Error {
  constructor(message: string) { super(message); this.name = "DatabaseConfigurationError"; }
}

export function resolveEnvironmentMode(expected?: EnvironmentMode): EnvironmentMode {
  const explicit = process.env.NODE_ENV;
  if (explicit !== undefined && explicit !== "development" && explicit !== "production" && explicit !== "test") {
    throw new DatabaseConfigurationError("NODE_ENV must be development, production or test.");
  }
  if (expected && explicit !== undefined && explicit !== expected) {
    throw new DatabaseConfigurationError(`This preparation requires NODE_ENV=${expected}; remove the contradictory NODE_ENV or set it to ${expected}.`);
  }
  return explicit ?? expected ?? "development";
}

export function loadDatabaseEnvironment(expected?: EnvironmentMode): EnvironmentMode {
  const mode = resolveEnvironmentMode(expected);
  // Next has already loaded the files, or this process has already used this boundary.
  // Do not reset @next/env's cache or reload files over runtime/process values.
  if (process.env.__NEXT_PROCESSED_ENV || process.env.NEXT_RUNTIME) return mode;
  Object.assign(process.env, { NODE_ENV: mode });
  loadEnvConfig(process.cwd(), mode === "development", {
    info: () => {},
    // Loader errors can contain file contents. Report configuration failure without secrets.
    error: () => { throw new DatabaseConfigurationError("Unable to load project environment files."); },
  });
  return mode;
}
