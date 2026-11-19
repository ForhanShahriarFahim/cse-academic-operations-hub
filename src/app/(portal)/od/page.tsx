import Link from "next/link";
import { ShieldQuestion } from "lucide-react";
import { TermWriteProvider } from "@/components/term-write-context";
import { EmptyNote, Notice, PageHeader, Panel, TableRegion } from "@/components/ui";
import { CommitmentRowActions } from "@/components/od/commitment-row-actions";
import { getCommitmentWorkspace, requireCommitmentManager, type CommitmentRow } from "@/lib/commitment-data";
import { COMMITMENT_CHOICES, filterRegister, parseRegisterFilters, registerCounts, registerQuery } from "@/lib/commitment-records";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  created: "Commitment recorded as Pending.",
  updated: "Commitment updated.",
  "returned-edit": "Commitment updated. Planning facts changed, so it returned to Pending.",
  resolved: "Note resolved into a structured commitment. It is Pending until verified.",
  verified: "Commitment verified.",
  returned: "Commitment returned to Pending.",
  archived: "Commitment archived. It no longer affects planning.",
  "archived-workload": "Commitment archived. Workload still counts it; archiving does not change workload.",
  reactivated: "Commitment reactivated as Pending.",
  deleted: "Mistaken entry deleted. Its audit history remains.",
};
const LEVEL_CLASS: Record<string, string> = {
  A: "border-[var(--color-pine)] text-[var(--color-pine)]", B: "border-[var(--color-moss)] text-[var(--color-pine)]",
  C: "border-[var(--color-gold)] text-gold-text", D: "border-[var(--color-clay)] text-[var(--color-clay)]",
};

function Level({ row }: { row: CommitmentRow }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 text-[11.5px] font-medium ${LEVEL_CLASS[row.storedLevel] ?? ""}`}>{row.storedLevel} · {row.levelText}</span>;
}
function Verification({ row }: { row: CommitmentRow }) {
  if (row.lifecycleStatus === "archived") return <span className="inline-block whitespace-nowrap rounded-full border border-[var(--color-line)] bg-wash px-2 text-[11.5px] font-medium text-ink-2">Archived</span>;
  return row.verificationStatus === "verified"
    ? <span className="inline-block whitespace-nowrap rounded-full border border-[var(--color-pine)]/40 bg-pine-tint px-2 text-[11.5px] font-medium text-[var(--color-pine)]" title={row.verificationNote ?? undefined}>✓ Verified</span>
    : <span className="inline-block whitespace-nowrap rounded-full border border-[var(--color-clay)]/40 bg-clay-tint px-2 text-[11.5px] font-medium text-[var(--color-clay)]">Pending</span>;
}
function Review({ row }: { row: CommitmentRow }) {
  if (!row.reviewReasons.length && row.storedLevel === row.derivedLevel) return null;
  const reasons = [...row.reviewReasons, ...(row.storedLevel !== row.derivedLevel ? [`Stored level ${row.storedLevel}; the current rule gives ${row.derivedLevel}. It updates when saved.`] : [])];
  return <p className="mt-1 max-w-[22rem] whitespace-normal text-[11.5px] leading-snug text-gold-text"><span className="font-semibold">{row.reviewReasons.length ? "Needs review: " : "Note: "}</span>{reasons.join(" ")}</p>;
}
const dash = <span className="text-muted" aria-label="Not applicable or not known">—</span>;
const title = (row: CommitmentRow) => `${row.counterpartDepartment}${row.teacherCode ? ` · ${row.teacherCode}` : ""}${row.roomCode ? ` · ${row.roomCode}` : ""}${row.schedule ? ` · ${row.schedule}` : ""}`;

export default async function CommitmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCommitmentManager("/od");
  const params = await searchParams;
  const filters = parseRegisterFilters(params);
  const { term, writeContext, rows } = await getCommitmentWorkspace();
  const visible = filterRegister(rows, filters);
  const counts = registerCounts(rows);
  const returnTo = `/od${registerQuery(filters)}`;
  const changed = typeof params.changed === "string" ? Number(params.changed) : null;
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const actionRow = (row: CommitmentRow) => ({ id: row.id, title: title(row), revision: row.revision, commands: row.commands, roomCode: row.roomCode, teacherCode: row.teacherCode, workload: row.workload });
  const select = "min-h-[2.75rem] rounded-md border border-[var(--color-line)] bg-white px-2 text-[13px]";

  return (
    <TermWriteProvider value={writeContext}>
      <div className="min-w-0">
        <PageHeader
          context={`Planning records · ${term.name}`}
          title="Cross-department commitments"
          description={<>Teachers and rooms committed to other departments. Together these records make the <strong>OD row</strong> (“Other Departments”) on the printed routine. A record blocks only what is actually known; notes block nothing.</>}
          actions={<Link href={`/od/new?return=${encodeURIComponent(returnTo)}`} className="inline-flex min-h-[2.75rem] items-center rounded-md bg-[var(--color-pine)] px-4 text-[13px] font-semibold text-white hover:bg-[var(--color-pine-2)]">Record commitment</Link>}
        />
        {notice ? <Notice tone="success" className="mb-3">{notice}</Notice> : null}

        <form method="get" action="/od" aria-label="Filter commitments" className="mb-3 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">State
            <select name="state" defaultValue={filters.state} className={select}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select>
          </label>
          <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">Verification
            <select name="verification" defaultValue={filters.verification} className={select}><option value="any">Any</option><option value="pending">Pending</option><option value="verified">Verified</option></select>
          </label>
          <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">What is committed
            <select name="kind" defaultValue={filters.kind} className={select}><option value="any">Any</option>{COMMITMENT_CHOICES.map((c) => <option key={c.kind} value={c.kind}>{c.short}</option>)}</select>
          </label>
          <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">Search
            <input type="search" name="q" defaultValue={filters.q} maxLength={80} placeholder="Department, course or audience" className={`${select} w-[min(16rem,80vw)]`} />
          </label>
          <button className="min-h-[2.75rem] rounded-md border border-[var(--color-pine)] px-4 text-[13px] font-semibold text-[var(--color-pine)]">Apply</button>
          {returnTo !== "/od" ? <Link href="/od" className="min-h-[2.75rem] content-center text-[13px] underline">Clear filters</Link> : null}
        </form>

        <p className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2" aria-label="Commitment counts">
          {([["active", "active"], ["pending", "pending"], ["verified", "verified"], ["unresolved", "unresolved notes"], ["archived", "archived"]] as const).map(([key, label]) => (
            <span key={key}><strong className="tabular text-[15px]">{counts[key]}</strong> {label}</span>
          ))}
        </p>

        <Panel title="Commitment register" sub={`${visible.length} of ${rows.length} records shown · completeness says how much is known, verification says whether it was confirmed`} flush>
          {visible.length === 0 ? (
            <div className="p-4"><EmptyNote>{rows.length ? "No commitments match these filters." : "No cross-department commitments are recorded for this term."}</EmptyNote></div>
          ) : (
            <>
              <div className="hidden sm:block">
                <TableRegion label="Commitment register">
                  <table className="routine-table w-full text-[12.5px]">
                    <thead>
                      <tr>
                        {["What is committed", "Department", "Teacher", "Room", "Day and time", "Course / audience", "Blocks", "Completeness", "Verification", "Actions"].map((h) => (
                          <th key={h} scope="col" className={`sticky top-0 bg-wash px-2.5 py-2 text-left ${h === "Actions" ? "text-right" : ""}`}><span className="micro-label">{h}</span></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={row.id} id={`od-${row.id}`} className={`border-t border-[var(--color-line-soft)] align-top ${row.id === changed ? "bg-pine-tint" : row.lifecycleStatus === "archived" ? "bg-wash text-ink-2" : "bg-sheet"}`}>
                          <th scope="row" className="min-w-[9rem] px-2.5 py-2 text-left font-medium">{row.choice}<Review row={row} /></th>
                          <td className="px-2.5 py-2 font-mono font-semibold">{row.counterpartDepartment}</td>
                          <td className="whitespace-nowrap px-2.5 py-2 font-mono">{row.teacherCode ?? dash}</td>
                          <td className="whitespace-nowrap px-2.5 py-2 font-mono">{row.roomCode ?? dash}</td>
                          <td className="min-w-[7.5rem] px-2.5 py-2 font-mono text-[12px]">{row.schedule ?? <span className="text-muted">Not known</span>}</td>
                          <td className="max-w-[16rem] px-2.5 py-2 text-[12px] leading-snug">
                            {row.courseLabel ?? (row.kind === "unresolved_note" ? <span className="italic">“{row.notes}”</span> : dash)}
                            {row.audienceLabel ? <span className="block text-muted">{row.audienceLabel}</span> : null}
                          </td>
                          <td className="min-w-[8rem] px-2.5 py-2 text-[12px]">{row.lifecycleStatus === "archived" ? <span className="text-muted">Nothing — archived</span> : row.blocks}</td>
                          <td className="px-2.5 py-2"><Level row={row} /></td>
                          <td className="px-2.5 py-2"><Verification row={row} />{row.archiveReason ? <span className="mt-1 block max-w-[12rem] text-[11.5px] text-muted">{row.archiveReason}</span> : null}</td>
                          <td className="whitespace-nowrap px-2.5 py-2"><CommitmentRowActions row={actionRow(row)} returnTo={returnTo} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableRegion>
              </div>
              <ul className="divide-y divide-[var(--color-line-soft)] sm:hidden" aria-label="Commitment register">
                {visible.map((row) => (
                  <li key={row.id} id={`od-m-${row.id}`} className={`px-4 py-3 ${row.id === changed ? "bg-pine-tint" : ""}`}>
                    <h3 className="text-[14px] font-semibold leading-snug">{row.counterpartDepartment} · {row.choice}</h3>
                    <dl className="mt-1.5 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[13px]">
                      <dt className="text-muted">When</dt><dd className="font-mono">{row.schedule ?? "Not known"}</dd>
                      {row.teacherCode ? <><dt className="text-muted">Teacher</dt><dd className="font-mono">{row.teacherCode}</dd></> : null}
                      {row.roomCode ? <><dt className="text-muted">Room</dt><dd className="font-mono">{row.roomCode}</dd></> : null}
                      {row.courseLabel || row.kind === "unresolved_note" ? <><dt className="text-muted">{row.kind === "unresolved_note" ? "Note" : "Course"}</dt><dd className="break-words">{row.courseLabel ?? row.notes}</dd></> : null}
                      <dt className="text-muted">Blocks</dt><dd>{row.lifecycleStatus === "archived" ? "Nothing — archived" : row.blocks}</dd>
                      <dt className="text-muted">Status</dt><dd className="flex flex-wrap gap-1"><Level row={row} /> <Verification row={row} /></dd>
                    </dl>
                    <Review row={row} />
                    <div className="mt-2"><CommitmentRowActions row={actionRow(row)} returnTo={returnTo} layout="m" /></div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <div className="mt-4">
          <EmptyNote>
            <ShieldQuestion size={13} aria-hidden="true" className="mr-1 inline text-gold-text" />
            Coverage disclosure: while records are pending or only partly known, the routine blocks only <em>known</em> teacher
            and room intervals and never reports “no university-wide conflicts”. Verify records with the other department to raise coverage.
          </EmptyNote>
        </div>
      </div>
    </TermWriteProvider>
  );
}
