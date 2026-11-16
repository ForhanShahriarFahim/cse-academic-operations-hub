import { checkPerformance, checkPerformancePostgres } from "./safety/performance.check";
async function main() {
  const baseline = process.argv.includes("--baseline");
  if (!process.argv.includes("--postgres-only")) for (const line of await checkPerformance(baseline)) console.log(`PGlite: ${line}`);
  if (!process.argv.includes("--pglite-only")) {
    if (process.env.SAFE01_PG_BIN) for (const line of await checkPerformancePostgres(process.env.SAFE01_PG_BIN, baseline)) console.log(`PostgreSQL: ${line}`);
    else console.log("PostgreSQL: PENDING; set SAFE01_PG_BIN");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
