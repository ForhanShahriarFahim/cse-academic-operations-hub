import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyNote, PageHeader } from "@/components/ui";
import { getCommitmentHistory, requireCommitmentManager } from "@/lib/commitment-data";
import { safeRegisterReturn } from "@/lib/commitment-records";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export default async function CommitmentHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
  const { id } = await params;
  await requireCommitmentManager(`/od/${id}/history`);
  if (!/^\d{1,9}$/.test(id)) notFound();
  const returnTo = safeRegisterReturn((await searchParams).return);
  const history = await getCommitmentHistory(Number(id));
  if (!history) notFound();
  const { row, events } = history;
  return (
    <div className="mx-auto min-w-0 max-w-[880px]">
      <Link href={returnTo} className="text-[13px] underline">← Cross-department commitments</Link>
      <PageHeader context="Planning records" title={`History · ${row.counterpartDepartment}${row.teacherCode ? ` · ${row.teacherCode}` : ""}${row.roomCode ? ` · ${row.roomCode}` : ""}`}
        description="Every change to this commitment, newest first. Times are Asia/Dhaka." />
      {events.length === 0 ? <EmptyNote>No recorded changes. Imported records have no history until they are changed here.</EmptyNote> : (
        <ol className="ml-2 border-l-2 border-[var(--color-line)]" aria-label="Change history">
          {events.map((event) => (
            <li key={event.id} className="relative pb-5 pl-5">
              <span aria-hidden="true" className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-[var(--color-pine)] bg-sheet" />
              <p className="text-[14px]"><strong>{event.label}</strong> <span className="text-muted">· <time dateTime={event.at}>{when.format(new Date(event.at))}</time> · {event.actor}</span></p>
              {event.changes.length ? (
                <ul className="mt-1 space-y-0.5 text-[13px]">
                  {event.changes.map((change) => (
                    <li key={change.field}>{change.field}: <del className="text-[var(--color-clay)]">{change.before}</del> → <ins className="font-semibold text-[var(--color-pine)] no-underline">{change.after}</ins></li>
                  ))}
                </ul>
              ) : null}
              {event.returnedToPending ? <p className="mt-1 text-[13px] text-gold-text">Planning facts changed, so it returned to Pending.</p> : null}
              {event.note ? <p className="mt-1 text-[13px]">Confirmation: “{event.note}”</p> : null}
              {event.reason ? <p className="mt-1 text-[13px]">Reason: “{event.reason}”</p> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
