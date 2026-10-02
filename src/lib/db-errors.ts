/** PostgreSQL error codes as raised by both adapters (pg and PGlite), directly or as a Drizzle `cause`. */
function pgCode(error: unknown): string | undefined {
  return (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
}

/** A row is still referenced by another table (`23503`), e.g. a delete raced with a new reference. */
export function isForeignKeyViolation(error: unknown): boolean {
  return pgCode(error) === "23503";
}
