import { existsSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { Client } from "pg";
import type { DatabaseTarget } from "../src/db/target";

const query = "select id, name, academic_year, start_date::text, end_date::text, status from academic_terms where status = 'active' order by id";
export async function checkTerms(target: DatabaseTarget) {
  // Do not initialize an absent embedded store merely to inspect it.
  if (target.mode === "pglite" && !target.directory.startsWith("memory://") && !existsSync(target.directory)) throw new Error("Diagnostic target does not exist.");
  const client = target.mode === "pglite" ? new PGlite(target.directory) : new Client({ connectionString: target.url });
  const execute = (statement: string): Promise<{ rows: unknown[] }> => client instanceof Client ? client.query(statement) : client.query(statement);
  try {
    if (client instanceof Client) await client.connect();
    await execute("begin read only");
    try {
      const result = await execute(query);
      return { activeCount: result.rows.length, state: result.rows.length === 0 ? "none" : result.rows.length === 1 ? "one" : "ambiguous", activeTerms: result.rows };
    } finally { await execute("rollback"); }
  } finally {
    if (client instanceof Client) await client.end();
    else await client.close();
  }
}
