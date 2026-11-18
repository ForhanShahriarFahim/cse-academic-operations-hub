"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { searchStudents, type studentDirectoryOptions } from "@/lib/student-directory";
import { StudentReview } from "./review";
import { fieldClass, primaryClass, secondaryClass } from "./styles";

export function StudentDirectory({ initial, options }: {
  initial: Awaited<ReturnType<typeof searchStudents>>;
  options: NonNullable<Awaited<ReturnType<typeof studentDirectoryOptions>>>;
}) {
  const [searchResult, setResult] = useState<typeof initial>();
  const result = searchResult ?? initial;
  const [pending, setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData>(new FormData());
  const busy = useRef(false);
  async function search(page: number, event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!form.current || busy.current) return;
    if (event) submitted.current = new FormData(form.current);
    const data = submitted.current;
    data.set("page", String(page));
    busy.current = true;
    setPending(true);
    try { setResult(await searchStudents(data)); }
    catch { setResult({ ok: false, message: "The search could not be completed. Try again." }); }
    finally { busy.current = false; setPending(false); }
  }
  return <><section className="ruled min-w-0 rounded-lg p-4">
    <form ref={form} onSubmit={event => void search(1, event)}>
      <fieldset disabled={pending} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto] xl:items-end">
        <label>Student ID or name<input name="q" type="search" maxLength={200} className={fieldClass} /></label>
        <label>Home batch<select name="batch" className={fieldClass} defaultValue="">
          <option value="">All batches</option><option value="none">No home batch</option>
          {options.homeBatches.map(batch => <option key={batch.id} value={batch.id}>{batch.stream} {batch.label}</option>)}
        </select></label>
        <label>Enrollment term<select name="term" className={fieldClass} defaultValue="">
          <option value="">All terms</option>{options.terms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
        </select></label>
        <label>Student status<select name="status" className={fieldClass} defaultValue="active">
          <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All statuses</option>
        </select></label>
        <button className={primaryClass}>Search</button>
      </fieldset>
    </form>
    <p role="status" className="mt-3 text-sm text-muted">{pending ? "Searching…" : "rows" in result
      ? result.rows.length ? `Page ${result.page} · ${result.rows.length} students shown` : result.hasStudents ? "No students match these filters." : "No student records yet."
      : result.message}</p>
    {"rows" in result && <>
      <ul className="mt-2 divide-y divide-[var(--color-line)]">
        {result.rows.map(row => <li key={row.id} className="grid min-w-0 gap-1 py-3 text-sm sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Link className="break-words font-semibold underline" href={`/students/${row.id}`}>{row.name}</Link>
          <span className="break-all font-mono">{row.code}</span>
          <span className="break-words text-muted">{row.batch ? `${row.stream} ${row.batch}` : "No home batch"}</span>
          <span className="break-words capitalize">{row.status}{row.label || row.department ? ` · ${row.label ?? row.department}` : ""}</span>
        </li>)}
      </ul>
      {(result.page > 1 || result.more) && <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryClass} disabled={pending || result.page <= 1} onClick={() => void search(result.page - 1)}>Previous page</button>
        <button type="button" className={secondaryClass} disabled={pending || !result.more} onClick={() => void search(result.page + 1)}>Next page</button>
      </div>}
    </>}
  </section>
  <StudentReview phone onApplied={() => void search("rows" in result ? result.page : 1)} /></>;
}
