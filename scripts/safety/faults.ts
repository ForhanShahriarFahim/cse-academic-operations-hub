/**
 * Database-level fault injection for owned SAFE-01 runs. A trigger makes every
 * `audit_events` insert fail while the fault is enabled, so production
 * transactions are exercised unchanged. Never installed outside owned runs.
 */
import type { OwnedPglite } from "./pglite";

export const INJECTED_AUDIT_FAILURE = "SAFE-01 injected audit failure";

export async function setAuditInsertFault(handle: OwnedPglite, enabled: boolean): Promise<void> {
  await handle.client.exec(`
    create table if not exists safe01_fault (active boolean not null);
    create or replace function safe01_fail_audit() returns trigger language plpgsql as $$
    begin
      if exists (select 1 from safe01_fault where active) then
        raise exception '${INJECTED_AUDIT_FAILURE}';
      end if;
      return new;
    end $$;
    drop trigger if exists safe01_fail_audit on audit_events;
    create trigger safe01_fail_audit before insert on audit_events for each row execute function safe01_fail_audit();
    delete from safe01_fault;
    ${enabled ? "insert into safe01_fault values (true);" : ""}
  `);
}
