/** Read-only operator entry: the preview must never import a database driver. */
import { databaseCommand, isCommand } from "../src/db/command";

if (isCommand("/scripts/check-terms.ts")) {
  Promise.resolve().then(async () => {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--show-target")) throw new Error("Unsupported diagnostic option.");
    const command = databaseCommand("db:check-terms", args);
    if (command.preview) return;
    const { checkTerms } = await import("./check-terms-implementation");
    const result = await checkTerms(command.target);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.activeCount > 1 ? 2 : 0;
  }).catch(() => {
    // Connection/driver errors can embed credentials; diagnostic failures expose no raw error.
    console.error("Term diagnostic failed. Check the named target, connection and academic_terms table. No term changes were requested.");
    process.exitCode = 1;
  });
}
