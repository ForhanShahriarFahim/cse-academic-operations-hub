import Link from "next/link";
import { notFound } from "next/navigation";
import { TermWriteProvider } from "@/components/term-write-context";
import { Notice, PageHeader } from "@/components/ui";
import { CommitmentForm } from "@/components/od/commitment-form";
import { getCommitment, requireCommitmentManager } from "@/lib/commitment-data";
import { isCommitmentKind, safeRegisterReturn } from "@/lib/commitment-records";

export const dynamic = "force-dynamic";

export default async function EditCommitmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string; resolve?: string }> }) {
  const { id } = await params;
  await requireCommitmentManager(`/od/${id}/edit`);
  if (!/^\d{1,9}$/.test(id)) notFound();
  const query = await searchParams;
  const returnTo = safeRegisterReturn(query.return);
  const found = await getCommitment(Number(id));
  if (!found) notFound();
  const { row, term, writeContext, options } = found;
  const resolving = row.kind === "unresolved_note" && query.resolve === "1";
  const archived = row.lifecycleStatus === "archived";
  // Legacy rows the form would refuse keep only the facts their choice allows; the person confirms the choice.
  const kind = resolving || !isCommitmentKind(row.kind) ? "" : row.kind;
  return (
    <TermWriteProvider value={writeContext}>
      <div className="min-w-0">
        <Link href={returnTo} className="text-[13px] underline">← Cross-department commitments</Link>
        <PageHeader context={`Planning records · ${term.name}`} title={`${resolving ? "Resolve note" : "Edit commitment"} · ${row.counterpartDepartment}${row.teacherCode ? ` · ${row.teacherCode}` : ""}`}
          description={<Link href={`/od/${row.id}/history?return=${encodeURIComponent(returnTo)}`} className="underline">View history</Link>} />
        {row.reviewReasons.length ? <Notice tone="warn" className="mb-3" title="This older record needs review">{row.reviewReasons.join(" ")} Choose what is committed and save to correct it.</Notice> : null}
        {archived ? (
          <Notice tone="info">This commitment is archived. Reactivate it from the register before editing.</Notice>
        ) : (
          <CommitmentForm mode={resolving ? "resolve" : "edit"} id={row.id} revision={row.revision} linkedTeachingGroupId={row.linkedTeachingGroupId} verified={row.verificationStatus === "verified"} returnTo={returnTo} {...options}
            initial={{
              kind, counterpartDepartment: row.counterpartDepartment, teacherId: row.teacherId ? String(row.teacherId) : "", roomId: row.roomId ? String(row.roomId) : "",
              dayOfWeek: row.dayOfWeek != null ? String(row.dayOfWeek) : "", startTime: row.form.startTime, endTime: row.form.endTime,
              effectiveFrom: row.effectiveFrom ?? "", effectiveTo: row.effectiveTo ?? "",
              courseLabel: row.courseLabel ?? "", audienceLabel: row.audienceLabel ?? "", credits: row.credits ?? "", notes: row.notes ?? "",
            }} />
        )}
      </div>
    </TermWriteProvider>
  );
}
