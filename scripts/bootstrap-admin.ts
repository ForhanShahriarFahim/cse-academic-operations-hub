/** Operator entry: preview and validate before loading account/database code. */
import { databaseCommand, isCommand } from "../src/db/command";

if (isCommand("/scripts/bootstrap-admin.ts")) {
  Promise.resolve().then(async () => {
    const args = process.argv.slice(2);
    if (databaseCommand("auth:bootstrap", args).preview) return;
    const { bootstrapAdmin } = await import("./bootstrap-admin-implementation");
    await bootstrapAdmin(args);
  }).then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
