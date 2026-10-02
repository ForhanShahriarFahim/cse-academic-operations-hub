import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Notice, PageHeader, Panel } from "@/components/ui";
import { DeactivateForm } from "@/components/teachers/lifecycle-forms";
import { buttonClass } from "@/components/account/styles";
import { allowedFrom, deactivationBlockers, deactivationNotes, transitionRefusal } from "@/lib/teacher-records";
import { getTeacherRecord, getTeacherReferences } from "@/lib/teacher-data";
import { requireTeacherEditor } from "@/lib/teacher-pages";

export const dynamic = "force-dynamic";

const OPEN_LABEL = { classes: "Open Routine builder", allocations: "Open Workload", externals: "Open Other departments", extra_load: "Open Extra class load" } as const;

export default async function DeactivateTeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireTeacherEditor(`/teachers/${id}/deactivate`);
  const record = await getTeacherRecord(Number(id));
  if (!record) notFound();
  const back = (
    <Link href={`/teachers/${record.id}`} className="no-print mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline">
      <ArrowLeft size={13} aria-hidden="true" /> {record.fullName}
    </Link>
  );
  if (!allowedFrom("deactivate", record.status)) {
    return <div className="mx-auto max-w-[760px]">{back}<PageHeader title={`Deactivate ${record.shortCode}?`} /><Notice tone="warn">{transitionRefusal("deactivate", record.status)}</Notice></div>;
  }
  const references = await getTeacherReferences(record.id, record.shortCode);
  const blockers = deactivationBlockers(references);
  const notes = deactivationNotes(references);

  return (
    <div className="mx-auto max-w-[760px]">
      {back}
      <PageHeader
        title={`Deactivate ${record.shortCode}?`}
        description={blockers.length
          ? `${record.fullName} still has work in ${references.termName}. Reassign or remove each item, then come back. Past terms never block this.`
          : `${record.fullName} has no classes, allocations or other-department commitments in ${references.termName}.`}
      />
      {blockers.length ? (
        <>
          <Panel title={`${blockers.length === 1 ? "1 item" : `${blockers.length} items`} in ${references.termName}`} flush>
            <ul className="divide-y divide-[var(--color-line-soft)] px-4">
              {blockers.map((item) => (
                <li key={item.kind} className="grid gap-x-4 gap-y-1 py-3 text-[13.5px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <span>{item.label}<span className="block text-[12.5px] text-muted">{item.detail}</span></span>
                  <Link href={item.href} className="text-[13px] font-semibold text-[var(--color-pine)] underline">{OPEN_LABEL[item.kind]}</Link>
                </li>
              ))}
            </ul>
          </Panel>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href={`/teachers/${record.id}`} className={buttonClass.secondary}>Back to teacher</Link>
            <button type="button" disabled aria-describedby="deactivate-why" className="inline-flex min-h-9 items-center rounded-md bg-[var(--color-clay)] px-4 text-[13.5px] font-semibold text-white opacity-45">Deactivate</button>
            <span id="deactivate-why" className="text-[12.5px] text-muted">Available once nothing above is left.</span>
          </div>
        </>
      ) : (
        <>
          <Panel title="What happens">
            <ul className="grid list-disc gap-2 pl-5 text-[13.5px]">
              <li>Listed under Inactive and no longer offered when assigning classes.</li>
              <li>Stays on published routines, past attendance, workload and extra-load records.</li>
              {notes.map((note) => <li key={note.kind}>{note.label} ({note.detail}).</li>)}
              <li>
                {references.portalAccount
                  ? <>Their portal account ({references.portalAccount.email}) is not changed. <Link href="/access" className="font-semibold text-[var(--color-pine)] underline">Suspend it in People &amp; Access</Link> if they should stop signing in.</>
                  : "No portal account is linked to this teacher."}
              </li>
            </ul>
          </Panel>
          <div className="mt-4"><DeactivateForm teacherId={record.id} code={record.shortCode} expectedUpdatedAt={record.updatedAt.toISOString()} /></div>
        </>
      )}
    </div>
  );
}
