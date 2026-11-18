"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { buttonClass, inputClass } from "@/components/account/styles";
import { Notice, Panel } from "@/components/ui";
import { startClassGroupsAction } from "@/lib/class-group-actions";
import { formatUnits, methodLabel } from "@/lib/class-group-records";
import type { ActionResult } from "@/lib/action-result";
import type { getClassGroupStartReview } from "@/lib/class-group-start-store";

type Review = NonNullable<NonNullable<Awaited<ReturnType<typeof getClassGroupStartReview>>>["review"]>;
type Row = Review["rows"][number];

function teacherList(teachers: Row["previous"]) {
  if (!teachers.valid) return "Allocation needs review";
  if (!teachers.rows.length) return "Vacancy";
  return teachers.rows.map(teacher => teacher.code + " · " + formatUnits(teacher.units) + " units" +
    (teacher.status === "active" ? "" : " (" + teacher.status + ")")).join(", ") +
    (teachers.method ? " · " + methodLabel(teachers.method) : "");
}

function teacherChanges(previous: Row["previous"], current: Row["previous"]) {
  const from = new Map(previous.rows.map(teacher => [teacher.teacherId, teacher]));
  const to = new Map(current.rows.map(teacher => [teacher.teacherId, teacher]));
  const changes: string[] = [];
  for (const teacher of previous.rows) {
    const next = to.get(teacher.teacherId);
    if (!next) changes.push(teacher.code + " removed");
    else if (next.units !== teacher.units) changes.push(teacher.code + " · " + formatUnits(teacher.units) + " → " + formatUnits(next.units) + " units");
  }
  for (const teacher of current.rows) {
    if (!from.has(teacher.teacherId)) changes.push(teacher.code + " added · " + formatUnits(teacher.units) + " units");
  }
  if (previous.method !== current.method) {
    changes.push("Crediting · " + (previous.method ? methodLabel(previous.method) : "Vacancy") + " → " + (current.method ? methodLabel(current.method) : "Vacancy"));
  }
  return changes;
}

export function ClassGroupStartForm({ termId, sourceId, sourceName, termStatus, review }: { termId: number; sourceId: number; sourceName: string; termStatus: string; review: Review }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState("");
  const [selectedFingerprint, setSelectedFingerprint] = useState(review.fingerprint);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const stale = result?.outcome?.kind === "stale";
  const base = "/terms/" + termId + "/groups";
  const chosen = review.rows.filter(row => row.selectable && selected.includes(row.sourceGroupId));
  const merged = chosen.filter(row => row.offeringIds.length > 1).length;
  const workload = new Map<number, Row["previous"]["rows"][number] & { added: number }>();
  for (const row of chosen) {
    for (const teacher of row.previous.rows) {
      workload.set(teacher.teacherId, { ...teacher, added: (workload.get(teacher.teacherId)?.added ?? 0) + teacher.units });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      const next = await startClassGroupsAction(form);
      setResult(next);
      if (next.ok || next.outcome?.kind === "stale") setSelected([]);
      if (next.ok) setReason("");
    });
  }

  return <form onSubmit={submit} className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.48fr)]">
    <input type="hidden" name="termId" value={termId} />
    <input type="hidden" name="sourceId" value={sourceId} />
    <input type="hidden" name="fingerprint" value={selectedFingerprint} />
    <section aria-label="Class groups to review" className="min-w-0 space-y-3">
      {!review.rows.some(row => row.selectable) && <Notice>No source groups are eligible to carry forward. Review the details below or <Link className="underline" href={base}>create groups individually</Link>.</Notice>}
      {review.rows.map(row => <Panel key={row.sourceGroupId} className="min-w-0 break-words text-sm">
        <div className="flex items-baseline gap-2">
          {row.selectable && <input type="checkbox" name="group" id={"carry-" + row.sourceGroupId} value={row.sourceGroupId}
            checked={selected.includes(row.sourceGroupId)} disabled={pending || stale}
            onChange={event => {
              if (!selected.length) setSelectedFingerprint(review.fingerprint);
              setSelected(event.target.checked ? [...selected, row.sourceGroupId] : selected.filter(id => id !== row.sourceGroupId));
            }} />}
          {row.selectable
            ? <label htmlFor={"carry-" + row.sourceGroupId} className="font-bold">{row.course.code} · {row.course.title}</label>
            : <h2 className="font-bold">{row.course.code} · {row.course.title}</h2>}
        </div>
        <p className="mt-2">{sourceName} audience: {row.priorAudience.join(", ") || "No linked cohort"}</p>
        <p>Destination audience: {row.destinationAudience.join(", ") || "No match"}{row.offeringIds.length > 1 ? " · Merged class" : ""}</p>
        <p>{sourceName} teachers: {teacherList(row.previous)}</p>
        {row.requirement && <p>Weekly requirement: {row.delivery === "teacher_managed" ? "Teacher-managed"
          : row.requirement.meetings + " meetings · " + row.requirement.minutes + " minutes"}{row.requirement.provisional ? " · Provisional" : ""}</p>}
        {row.destinationGroupId && <div className="mt-2 border-t border-line pt-2">
          <p className="font-semibold"><Link className="underline" href={base + "/" + row.destinationGroupId}>Already grouped</Link> · {row.comparison === "carried" ? "Teachers carried" : row.comparison === "changed" ? "Teachers changed" : "Teacher comparison unavailable"}</p>
          {row.current && <p>Destination teachers: {teacherList(row.current)}</p>}
          {row.current && row.comparison === "changed" && <ul className="mt-1 list-disc pl-4">
            {teacherChanges(row.previous, row.current).map(change => <li key={change}>{change}</li>)}
          </ul>}
          {row.current && row.comparison === null && <p className="text-muted">A teacher comparison requires matching audiences and usable allocations.</p>}
        </div>}
        {row.problems.length > 0 && <ul className="mt-2 list-disc pl-4 text-muted">{row.problems.map((problem, index) => <li key={index}>{problem}</li>)}</ul>}
      </Panel>)}
      {!!review.unmatched.length && <Panel>
        <h2 className="font-bold">Destination groups without a comparable source</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {review.unmatched.map(row => <li key={row.id}><Link className="underline" href={base + "/" + row.id}>{row.code} · {row.audience.join(", ") || "No linked cohort"}</Link></li>)}
        </ul>
      </Panel>}
    </section>

    <Panel className="min-w-0 self-start">
      <h2 className="font-bold">Selection</h2>
      <p aria-live="polite" className="mt-2 text-sm">{chosen.length} selected · {merged} merged</p>
      <p className="mt-2 text-sm text-muted">Created groups will be unscheduled.{termStatus === "active" ? " New allocations affect workload and extra-load eligibility immediately." : ""}</p>
      {workload.size > 0 && <ul aria-label="Projected workload totals" className="mt-3 space-y-1 text-sm">
        {[...workload.values()].sort((a, b) => a.code.localeCompare(b.code)).map(teacher => <li key={teacher.teacherId}>
          {teacher.code} · {formatUnits(teacher.total)} → {formatUnits(teacher.total + teacher.added)} units
          {teacher.total + teacher.added > teacher.limit && <strong className="block">Above advisory limit of {formatUnits(teacher.limit)} units</strong>}
        </li>)}
      </ul>}
      <label htmlFor="start-reason" className="mt-3 block text-sm font-semibold">Reason</label>
      <textarea id="start-reason" name="reason" rows={3} required maxLength={300} value={reason}
        className={inputClass} onChange={event => setReason(event.target.value)} />
      <button className={buttonClass.primary + " mt-3"} disabled={pending || stale || chosen.length === 0}>{pending ? "Creating groups…" : "Create selected groups"}</button>
      <p role="status" className="mt-2 text-sm">{pending ? "Saving selected groups…" : result?.ok ? result.message : ""}</p>
      {result && !result.ok && <p role="alert" className="mt-1 text-sm">{result.message}</p>}
      {stale && <Link className="text-sm underline" href={base + "/start?source=" + sourceId} onClick={event => { event.preventDefault(); window.location.reload(); }}>Reload review</Link>}
      {result?.ok && <p className="text-sm"><Link className="underline" href={base}>Class groups</Link> · <Link className="underline" href={base + "/history"}>Change history</Link></p>}
    </Panel>
  </form>;
}
