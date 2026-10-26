/** No database imports: validate and name a target before a command imports its implementation. */
import { loadDatabaseEnvironment, type EnvironmentMode } from "./environment";
import { databaseTarget } from "./target";

type Command = "db:prepare" | "db:migrate" | "db:reset" | "auth:bootstrap";

export function databaseCommand(command: Command, args: string[]) {
  let expected: EnvironmentMode | undefined;
  if (command === "db:prepare") {
    if (process.env.npm_lifecycle_event === "predev") expected = "development";
    if (process.env.npm_lifecycle_event === "prestart") expected = "production";
  }
  const environment = loadDatabaseEnvironment(expected);
  const target = databaseTarget();
  console.log(`Command: ${command}\nEnvironment: ${environment}\nMode: ${target.mode}\nTarget: ${target.label}`);
  const preview = args.includes("--show-target");
  if (preview) console.log("Preview only; no database opened.");
  return { target, preview };
}

export function isCommand(suffix: string): boolean {
  return process.argv[1]?.replaceAll("\\", "/").endsWith(suffix) ?? false;
}
