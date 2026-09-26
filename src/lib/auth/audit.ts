import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { requireActor } from ".";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface AuditResult<T> {
  result: T;
  entityId: number | null;
  before?: unknown;
  after?: unknown;
  detail?: unknown;
}

/** Keep the domain change and its named audit record in one database commit. */
export async function auditedChange<T>(
  action: string,
  entity: string,
  change: (tx: Transaction) => Promise<AuditResult<T>>,
): Promise<T> {
  const actor = await requireActor();
  return db.transaction(async (tx) => {
    const event = await change(tx);
    await tx.insert(auditEvents).values({
      actor: actor.displayName,
      actorUserId: actor.id,
      actorDisplayName: actor.displayName,
      actorKind: "user",
      action,
      entity,
      entityId: event.entityId,
      before: event.before ?? null,
      after: event.after ?? null,
      detail: event.detail ?? null,
    });
    return event.result;
  });
}
