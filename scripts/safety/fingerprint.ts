/**
 * Canonical database fingerprints for recovery and history checks. Row digests
 * are order-independent and normalise dates, JSON key order and binary values;
 * schema digests cover columns, constraints, indexes and sequence positions.
 * Fingerprints hold only counts and hashes, so they are safe to record.
 */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";

const SCHEMAS = ["public", "drizzle"];

export interface TableFingerprint {
  rows: number;
  digest: string;
}

export interface DatabaseFingerprint {
  schema: string;
  sequences: Record<string, string | null>;
  tables: Record<string, TableFingerprint>;
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

export function canonical(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value as object).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
}

export const canonicalJson = (value: unknown) => JSON.stringify(canonical(value));

async function rowsOf<T>(client: PGlite, query: string, params: unknown[] = []): Promise<T[]> {
  return (await client.query<T>(query, params)).rows;
}

export async function tableFingerprint(client: PGlite, schemaName: string, table: string, where = ""): Promise<TableFingerprint> {
  const rows = await rowsOf<Record<string, unknown>>(client, `select * from "${schemaName}"."${table}" ${where}`);
  const lines = rows.map(canonicalJson).sort();
  return { rows: rows.length, digest: sha(lines.join("\n")) };
}

export async function fingerprintDatabase(client: PGlite): Promise<DatabaseFingerprint> {
  const tables = await rowsOf<{ table_schema: string; table_name: string }>(client, `
    select table_schema, table_name from information_schema.tables
    where table_schema = any($1) and table_type = 'BASE TABLE' order by 1, 2`, [SCHEMAS]);
  const columns = await rowsOf(client, `
    select table_schema, table_name, column_name, ordinal_position, data_type, is_nullable, column_default
    from information_schema.columns where table_schema = any($1) order by 1, 2, 4`, [SCHEMAS]);
  const constraints = await rowsOf(client, `
    select n.nspname as schema, c.conrelid::regclass::text as relation, c.conname, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = any($1) order by 1, 2, 3`, [SCHEMAS]);
  const indexes = await rowsOf(client, `
    select schemaname, tablename, indexname, indexdef from pg_indexes where schemaname = any($1) order by 1, 2, 3`, [SCHEMAS]);
  const sequences = await rowsOf<{ name: string; last_value: string | number | null }>(client, `
    select schemaname || '.' || sequencename as name, last_value from pg_sequences where schemaname = any($1) order by 1`, [SCHEMAS]);

  const result: DatabaseFingerprint = {
    schema: sha(canonicalJson({ tables, columns, constraints, indexes })),
    sequences: Object.fromEntries(sequences.map((row) => [row.name, row.last_value == null ? null : String(row.last_value)])),
    tables: {},
  };
  for (const { table_schema, table_name } of tables) {
    result.tables[`${table_schema}.${table_name}`] = await tableFingerprint(client, table_schema, table_name);
  }
  return result;
}

/** Names of tables whose rows, or any schema/sequence component, differ. */
export function fingerprintDifferences(expected: DatabaseFingerprint, actual: DatabaseFingerprint): string[] {
  const differences: string[] = [];
  if (expected.schema !== actual.schema) differences.push("schema");
  for (const name of new Set([...Object.keys(expected.sequences), ...Object.keys(actual.sequences)])) {
    if (expected.sequences[name] !== actual.sequences[name]) differences.push(`sequence ${name}`);
  }
  for (const name of new Set([...Object.keys(expected.tables), ...Object.keys(actual.tables)])) {
    const a = expected.tables[name];
    const b = actual.tables[name];
    if (!a || !b || a.rows !== b.rows || a.digest !== b.digest) differences.push(`table ${name}`);
  }
  return differences;
}
