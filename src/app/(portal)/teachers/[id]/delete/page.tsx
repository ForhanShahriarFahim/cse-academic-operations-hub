import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Notice, PageHeader, Panel } from "@/components/ui";
import { DeleteForm } from "@/components/teachers/lifecycle-forms";
import { buttonClass } from "@/components/account/styles";
import { allowedFrom, deletionRefusals, isPlaceholder } from "@/lib/teacher-records";
import { getTeacherRecord, getTeacherReferences } from "@/lib/teacher-data";
import { requireTeacherEditor } from "@/lib/teacher-pages";

export const dynamic = "force-dynamic";

export default async function DeleteTeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireTeacherEditor(`/teachers/${id}/delete`);
  const record = await getTeacherRecord(Number(id));
  if (!record) notFound();
  const refusals = deletionRefusals(await getTeacherReferences(record.id, record.shortCode));
  const canDeactivate = allowedFrom("deactivate", record.status);

  return (
    <div className="mx-auto max-w-[760px]">
      <Link href={`/teachers/${record.id}`} className="no-print mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-pine)] hover:underline">
        <ArrowLeft size={13} aria-hidden="true" /> {record.fullName}
      </Link>
      <PageHeader
        title={`Delete ${record.shortCode}?`}
        description={refusals.length ? undefined : `“${record.fullName}” has never been used in any term, publication or account.`}
      />
      {refusals.length ? (
        <>
          <Notice tone="error" title={`${record.shortCode} can’t be deleted.`}>
            <ul className="mt-1 list-disc pl-4">{refusals.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            {isPlaceholder(record.status) ? null : <p className="mt-1">Teachers with any history are kept. Deactivate them instead.</p>}
          </Notice>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/teachers/${record.id}`} className={buttonClass.secondary}>Back to teacher</Link>
            {canDeactivate ? <Link href={`/teachers/${record.id}/deactivate`} className={buttonClass.primary}>Deactivate instead</Link> : null}
          </div>
        </>
      ) : (
        <Panel title="This cannot be undone">
          <Notice tone="info" className="mb-4">Only a record that was never used can be deleted. The deletion is recorded in the audit log.</Notice>
          <DeleteForm teacherId={record.id} code={record.shortCode} expectedUpdatedAt={record.updatedAt.toISOString()} />
        </Panel>
      )}
    </div>
  );
}
