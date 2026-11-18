"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { studentCsvHeadings, suggestedStudentCsvField, type StudentCsvField, type RosterImportReceipt } from "@/lib/attendance";
import { reviewBatchEnrollment, reviewStudentCsv } from "@/lib/student-roster-actions";
import { appendTermContext, type TermWriteContext } from "@/lib/term-context-value";
import { fieldClass, primaryClass, secondaryClass } from "./styles";

type Batch = { id: number; stream: string; label: string };
type Result = Awaited<ReturnType<typeof reviewStudentCsv>>;
const fields: Array<[StudentCsvField, string]> = [
  ["studentCode", "Student ID"], ["fullName", "Student name"], ["department", "Department"],
  ["homeBatch", "Home batch"], ["phone", "Private phone"], ["audienceType", "Audience type"],
];
const sample = "Student ID,Student Name,Department,Audience Type\n00141,Example Student,CSE,local\n";

function Counts({ receipt }: { receipt: RosterImportReceipt }) {
  return <dl className="flex flex-wrap gap-2 text-sm">{(["created", "updated", "unchanged", "skipped", "failed"] as const).map(kind =>
    <div key={kind} className="rounded bg-wash px-2 py-1"><dt className="capitalize">{kind}</dt><dd className="font-semibold">{receipt[kind]}</dd></div>)}</dl>;
}

export function StudentReview({ groupId, context, phone, batchOptions, onApplied }: {
  groupId?: number;
  context?: TermWriteContext;
  phone: boolean;
  batchOptions?: Batch[];
  onApplied?: () => void;
}) {
  const isBatch = batchOptions !== undefined;
  const router = useRouter();
  const [headings, setHeadings] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<StudentCsvField, string>>>({});
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState<"file" | "preview" | "confirm">();
  const [didApply, setDidApply] = useState(false);
  const [fileError, setFileError] = useState("");
  const version = useRef(0);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const allowed = fields.filter(([field]) => (field !== "phone" || phone) && (field !== "audienceType" || groupId));
  function invalidate() {
    version.current++;
    setResult(undefined);
    setDidApply(false);
  }
  async function read(file: File | undefined) {
    invalidate();
    const generation = version.current;
    setHeadings([]);
    setMapping({});
    setPending(file ? "file" : undefined);
    setFileError("");
    if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error("Choose a CSV file up to 256 KiB.");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (generation !== version.current) return;
      if (text.split(/\r?\n/).filter(line => line.trim()).length > 501) throw new Error("Use up to 500 nonblank data lines.");
      const header = studentCsvHeadings(text);
      if (!header) throw new Error("The heading row could not be read.");
      const suggestions = header.map(suggestedStudentCsvField);
      setHeadings(header);
      setMapping(Object.fromEntries(allowed.flatMap(([field]) => suggestions.filter(value => value === field).length === 1
        ? [[field, String(suggestions.indexOf(field) + 1)]] : [])));
    } catch (error) {
      if (generation === version.current) setFileError(error instanceof Error ? error.message : "Choose a UTF-8 CSV file.");
    } finally {
      if (generation === version.current) setPending(undefined);
    }
  }
  async function submit(event: Pick<FormEvent, "preventDefault">, confirm = false) {
    event.preventDefault();
    if (busy.current || !form.current || confirm && !result?.proof) return;
    const generation = version.current;
    const data = new FormData(form.current);
    data.set("mode", groupId ? "roster" : "directory");
    data.set("operation", confirm ? "confirm" : "preview");
    if (groupId) data.set("teachingGroupId", String(groupId));
    if (context) appendTermContext(data, context);
    if (confirm && result?.proof) data.set("proof", result.proof);
    busy.current = true;
    setPending(confirm ? "confirm" : "preview");
    let response: Result;
    try { response = await (isBatch ? reviewBatchEnrollment(data) : reviewStudentCsv(data)); }
    catch { response = { ok: false, message: "The request could not be confirmed. Preview the current data again." }; }
    busy.current = false;
    setPending(undefined);
    if (generation !== version.current) return;
    setResult(response);
    if (confirm && response.receipt) { setDidApply(true); router.refresh(); onApplied?.(); }
    requestAnimationFrame(() => summary.current?.focus());
  }
  const proof = result?.proof;
  const count = (result?.receipt?.created ?? 0) + (result?.receipt?.updated ?? 0);
  return <section className="ruled min-w-0 rounded-lg p-4">
    <h2 className="font-display text-lg font-semibold">{isBatch ? "Enroll a batch" : "Import CSV"}</h2>
    <form ref={form} onSubmit={event => submit(event)} className="mt-3 space-y-3">
      <fieldset disabled={pending === "preview" || pending === "confirm"} className="min-w-0 space-y-3">
        {isBatch ? <div className="grid gap-3 sm:grid-cols-2">
          <label>Home batch<select className={fieldClass} required name="batchId" defaultValue="" onChange={invalidate}>
            <option value="">Choose a linked batch</option>{batchOptions.map(batch => <option value={batch.id} key={batch.id}>{batch.stream} {batch.label}</option>)}
          </select></label>
          <label>Audience for new enrollments<select className={fieldClass} required name="audienceType" defaultValue="" onChange={invalidate}>
            <option value="">Choose an audience</option><option value="local">Local</option><option value="merged">Merged audience</option>
          </select></label>
        </div> : <>
          <label>CSV file<input className={fieldClass} type="file" name="csv" accept=".csv,text/csv" onChange={event => void read(event.target.files?.[0])} /></label>
          <p className="text-sm text-muted">UTF-8 · Up to 500 data lines and 256 KiB. <a className="underline" download="student-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(sample)}`}>Download a sample</a></p>
          {headings.length > 0 && <div className="grid min-w-0 gap-3 sm:grid-cols-2">{allowed.map(([field, label]) => {
            const required = field === "studentCode" || field === "fullName";
            return <label className="min-w-0" key={field}>{label}<select className={fieldClass} required={required} name={`map:${field}`} value={mapping[field] ?? ""} onChange={event => {
              invalidate(); setMapping(current => ({ ...current, [field]: event.target.value }));
            }}><option value="">{required ? "Choose a column" : "Ignore"}</option>
              {headings.map((heading, index) => <option key={index} value={index + 1}>{index + 1} · {heading.slice(0, 120) || "Unnamed column"}</option>)}
            </select></label>;
          })}</div>}
        </>}
        <button className={secondaryClass} disabled={Boolean(pending) || (isBatch ? !batchOptions.length : !headings.length)}>{isBatch ? "Preview enrollment" : "Preview import"}</button>
      </fieldset>
    </form>
    {isBatch && !batchOptions.length && <p className="mt-2 text-sm text-muted">No eligible batches are linked to this group.</p>}
    <div role="status" aria-atomic="true" tabIndex={-1} ref={summary} className="mt-3 text-sm empty:hidden">
      {fileError || (pending ? { file: "Reading CSV…", preview: "Preparing preview…", confirm: "Applying reviewed changes…" }[pending] : result?.message)}
    </div>
    {result?.receipt && <div className="mt-3 space-y-3">
      <h3 className="font-display text-base font-semibold">{didApply ? "Receipt" : "Review outcomes"}</h3>
      <Counts receipt={result.receipt} />
      {result.rows && <ul className="max-h-80 divide-y overflow-auto rounded border border-[var(--color-line)] text-sm" aria-label="CSV outcomes" tabIndex={0}>
        {result.rows.map(row => <li key={row.row} className="break-words p-2"><strong>Line {row.row} · <span className="capitalize">{row.kind}</span></strong> · {row.message}</li>)}
      </ul>}
      {result.candidates && <ul className="max-h-80 divide-y overflow-auto rounded border border-[var(--color-line)] text-sm" aria-label="Batch candidates" tabIndex={0}>
        {result.candidates.map(row => <li key={row.id} className="break-words p-2">{row.name} · {row.code} · <strong>{row.disposition}</strong></li>)}
      </ul>}
      {didApply && result.receipt.failed > 0 && <p className="text-sm">Correct the failed lines and preview the corrected file.</p>}
      {proof && <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryClass} disabled={Boolean(pending)} onClick={event => void submit(event, true)}>
          {isBatch ? `Enroll ${count} ${count === 1 ? "student" : "students"}` : `Import ${count} eligible ${count === 1 ? "row" : "rows"}`}
        </button>
        <button type="button" className={secondaryClass} disabled={Boolean(pending)} onClick={invalidate}>Cancel review</button>
      </div>}
    </div>}
  </section>;
}
