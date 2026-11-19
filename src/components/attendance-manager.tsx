"use client";

import { useTermActions } from "@/components/term-write-context";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCheck, Save, Trash2 } from "lucide-react";
import type { ActionResult } from "@/lib/actions";

import type { AttendanceStatus } from "@/lib/attendance";
import { fmtRange } from "@/lib/time";
import { useConfirm } from "@/components/confirm-dialog";

interface Group { id: number; courseCode: string; courseTitle: string; courseType: string; audience: string; teacherIds: number[] }
interface Teacher { id: number; shortCode: string; fullName: string }
interface StudentRow {
  id: number; studentCode: string; fullName: string;
  enrollment: { audienceType: string };
}
interface SessionRow {
  id: number; classDate: string; phase: string; startMinutes: number | null; endMinutes: number | null;
  records: Array<{ studentId: number; status: string; studentCode: string; fullName: string }>;
}
interface SummaryRow {
  studentId: number;
  midterm: { attended: number; total: number };
  final: { attended: number; total: number };
  semester: { attended: number; total: number; percentage: number };
  mark: number; maximum: number;
}

const control = "w-full rounded-md border border-[var(--color-line)] bg-white px-2.5 py-2 text-[12.5px]";

type FeedbackArea = "create" | "marks" | "delete";
type FeedbackResult = ActionResult;
const labels: Record<FeedbackArea, string> = { create: "Creating session…", marks: "Saving attendance…", delete: "Deleting session…" };

function AttendanceFeedback({ area, result, pending }: { area: FeedbackArea; result?: FeedbackResult; pending: boolean }) {
  return <div data-feedback={area} className="min-w-0 px-4 empty:p-0">
    <div id={`attendance-${area}-result`} role="status" aria-atomic="true" tabIndex={-1}
      className={pending || result ? `mb-3 rounded-md border px-3 py-2 text-sm outline-offset-2 ${result && !result.ok ? "border-[var(--color-gold)] bg-gold-tint" : "border-[var(--color-line)] bg-wash"}` : ""}>
      {pending ? labels[area] : result?.message}
    </div>
  </div>;
}

export function AttendanceManager({ selectedGroup, teachers, roster, sessions, summaries, termStart, termEnd, canManageRosters, canTakeAttendance, rollCallHref, initialSessionId, maximum }: {
  selectedGroup: Group;
  teachers: Teacher[];
  roster: StudentRow[];
  sessions: SessionRow[];
  summaries: SummaryRow[];
  termStart: string;
  termEnd: string;
  canManageRosters: boolean;
  canTakeAttendance: boolean;
  rollCallHref?: string;
  initialSessionId?: number;
  maximum: number;
}) {
  const { createAttendanceSessionAction, deleteAttendanceSessionAction, saveAttendanceAction } = useTermActions();
  const [ask, confirmDialog] = useConfirm();
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<Partial<Record<FeedbackArea, FeedbackResult>>>({});
  const [pendingArea, setPendingArea] = useState<FeedbackArea | null>(null);
  const submitting = useRef(false);
  const manager = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<{ area: FeedbackArea; trigger: HTMLElement | null; field?: HTMLElement | null; success: boolean } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId ?? sessions.at(-1)?.id);
  const effectiveSessionId = initialSessionId !== undefined || sessions.some(session => session.id === activeSessionId)
    ? activeSessionId
    : sessions.at(-1)?.id;
  const activeSession = sessions.find((session) => session.id === effectiveSessionId) ?? null;
  const [statusOverrides, setStatusOverrides] = useState<Record<string, AttendanceStatus>>({});
  const sessionForm = useRef<HTMLFormElement>(null);
  const groupTeachers = teachers.filter((teacher) => selectedGroup.teacherIds.includes(teacher.id));
  const summaryByStudent = useMemo(() => new Map(summaries.map((row) => [row.studentId, row])), [summaries]);

  const sessionRoster = activeSession?.records.map(({ studentId, ...student }) => ({ ...student, id: studentId })) ?? [];

  function statusFor(studentId: number): AttendanceStatus {
    const record = activeSession?.records.find((record) => record.studentId === studentId);
    if (!record) throw new Error("Student is not captured in this attendance session.");
    return statusOverrides[`${effectiveSessionId}:${studentId}`] ?? record.status as AttendanceStatus;
  }

  function selectSession(id: number) {
    if (id === effectiveSessionId) return;
    setResults(current => ({ ...current, marks: undefined, delete: undefined }));
    setActiveSessionId(id);
  }

  useEffect(() => {
    const request = focusRequest.current;
    if (!request || pending) return;
    focusRequest.current = null;
    const active = document.activeElement;
    if (active !== document.body && active !== request.trigger) return;
    const summary = manager.current?.querySelector<HTMLElement>(`[data-feedback="${request.area}"] [role="status"]`);
    const trigger = request.trigger?.isConnected && !request.trigger.matches(":disabled") ? request.trigger : null;
    (request.success ? trigger ?? summary : request.field ?? summary)?.focus();
  }, [pending, results]);

  function run(area: FeedbackArea, action: () => Promise<FeedbackResult>, onSuccess?: () => void) {
    if (submitting.current) return;
    submitting.current = true;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPendingArea(area);
    setResults(current => ({ ...current, [area]: undefined }));
    startTransition(async () => {
      let response: FeedbackResult;
      try {
        response = await action();
      } catch {
        response = { ok: false, message: "The result could not be confirmed. Check the latest attendance or roster before trying again." };
      }
      if (response.ok) onSuccess?.();
      const name = response.outcome?.kind === "validation" ? Object.keys(response.outcome.fieldErrors)[0] : undefined;
      const form = area === "create" ? sessionForm.current : null;
      const field = name ? form?.elements.namedItem(name) : null;
      focusRequest.current = { area, trigger, field: field instanceof HTMLElement ? field : null, success: response.ok };
      setResults(current => ({ ...current, [area]: response }));
      setPendingArea(null);
      submitting.current = false;
    });
  }

  function feedback(area: FeedbackArea) {
    return <AttendanceFeedback area={area} result={results[area]} pending={pendingArea === area} />;
  }

  function fieldFeedback(area: FeedbackArea, name: string) {
    const outcome = results[area]?.outcome;
    return outcome?.kind === "validation" && outcome.fieldErrors[name]?.length
      ? { "aria-invalid": true, "aria-describedby": `attendance-${area}-result` } : {};
  }

  return <div ref={manager} className="space-y-4">{confirmDialog}
    <section className="ruled rounded-lg p-4">
      <span className="text-sm"><strong>{selectedGroup.courseType === "sessional" ? "Lab / sessional" : "Theory"}</strong> · {maximum} attendance marks</span>
    </section>

    <div className="flex flex-wrap gap-2">
      {canManageRosters && <Link className="inline-block rounded-md border border-[var(--color-line)] px-3 py-2 text-sm font-semibold" href={`/attendance/roster?group=${selectedGroup.id}`}>Manage roster</Link>}
      {rollCallHref && <a className="inline-block rounded-md border border-[var(--color-line)] px-3 py-2 text-sm font-semibold" href={rollCallHref}>Printable roll-call</a>}
    </div>


    {canTakeAttendance && <section id="attendance-sessions" tabIndex={-1} className="ruled scroll-mt-20 rounded-lg" aria-labelledby="attendance-create-heading">
      <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 id="attendance-create-heading" className="font-display text-[15px] font-semibold">Create attendance session</h2></header>
      <form ref={sessionForm} className="grid gap-2 p-4 md:grid-cols-6" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); run("create", () => createAttendanceSessionAction(data), () => form.reset()); }}><fieldset className="contents" disabled={pendingArea === "create"}>
        <input type="hidden" name="teachingGroupId" value={selectedGroup.id} />
        <label><span className="micro-label mb-1 block">Date</span><input name="classDate" {...fieldFeedback("create", "classDate")} type="date" min={termStart} max={termEnd} className={control} required /></label>
        <label><span className="micro-label mb-1 block">Phase</span><select name="phase" {...fieldFeedback("create", "phase")} className={control}><option value="midterm">Before / midterm</option><option value="final">After midterm / final</option></select></label>
        <label><span className="micro-label mb-1 block">Teacher</span><select name="teacherId" {...fieldFeedback("create", "teacherId")} className={control}><option value="">—</option>{groupTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.shortCode}</option>)}</select></label>
        <label><span className="micro-label mb-1 block">Start (optional)</span><input name="startTime" {...fieldFeedback("create", "startTime")} type="time" className={control} /></label>
        <label><span className="micro-label mb-1 block">End (optional)</span><input name="endTime" {...fieldFeedback("create", "endTime")} type="time" className={control} /></label>
        <button disabled={pending || roster.length === 0} className="self-end rounded-md bg-[var(--color-pine)] px-3 py-2 text-[12px] font-semibold text-white">Create session</button>
      </fieldset></form>
      {feedback("create")}
    </section>}

    <section id="roll-call" tabIndex={-1} className="ruled scroll-mt-20 rounded-lg" aria-labelledby="roll-call-heading">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line-soft)] px-4 py-3">
        <div><h2 id="roll-call-heading" className="font-display text-[15px] font-semibold">Take attendance</h2><p className="mt-0.5 text-[11.5px] text-muted">Late counts as attended; excused is excluded from the denominator. Only students captured when this session was created can be marked.</p></div>
        <div className="flex flex-wrap gap-1.5">{sessions.map((session) => <button key={session.id} disabled={pending} aria-pressed={session.id === effectiveSessionId} onClick={() => selectSession(session.id)} className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${session.id === effectiveSessionId ? "border-[var(--color-pine)] bg-[var(--color-pine)] text-white" : "border-[var(--color-line)] bg-white"}`}>{session.classDate} · {session.phase}{session.startMinutes != null && session.endMinutes != null ? ` · ${fmtRange(session.startMinutes, session.endMinutes)}` : ""}</button>)}</div>
      </header>
      {feedback("delete")}
      {!activeSession ? <p className="p-8 text-center text-[12px] text-muted">{sessions.length ? "Choose a dated session to see its attendance." : "Create a session to take attendance."}</p> : <>
        {canTakeAttendance && <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line-soft)] px-4 py-2.5">
          <span className="mr-auto text-[12px]"><strong>{activeSession.classDate}</strong> · {activeSession.phase}{activeSession.startMinutes != null && activeSession.endMinutes != null ? ` · ${fmtRange(activeSession.startMinutes, activeSession.endMinutes)}` : ""}</span>
          <button disabled={pending || sessionRoster.length === 0} onClick={() => setStatusOverrides((current) => ({ ...current, ...Object.fromEntries(sessionRoster.map((student) => [`${effectiveSessionId}:${student.id}`, "present" as AttendanceStatus])) }))} className="inline-flex items-center gap-1 rounded-md border border-[var(--color-pine)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-pine)]"><CheckCheck size={12} />Mark all present</button>
          <button disabled={pending || sessionRoster.length === 0} onClick={() => {
            const values = sessionRoster.map(student => ({ studentId: student.id, status: statusFor(student.id) }));
            run("marks", () => saveAttendanceAction(activeSession.id, values), () => {
              setStatusOverrides(current => {
                const next = { ...current };
                for (const { studentId } of values) delete next[`${activeSession.id}:${studentId}`];
                return next;
              });
            });
          }} className="inline-flex items-center gap-1 rounded-md bg-[var(--color-pine)] px-3 py-1.5 text-[11px] font-semibold text-white"><Save size={12} />Save</button>
          <button type="button" disabled={pending} aria-label="Delete this attendance session" title="Delete session" onClick={async () => { if (await ask({ title: "Delete this attendance session?", body: "The session and every mark recorded in it will be removed. Students' other sessions are not affected.", confirmLabel: "Delete session" })) run("delete", () => deleteAttendanceSessionAction(activeSession.id), () => {
            setActiveSessionId(initialSessionId === undefined ? undefined : 0);
            setResults(current => ({ ...current, marks: undefined }));
          }); }} className="rounded p-1.5 text-[var(--color-clay)]"><Trash2 size={13} aria-hidden="true" /></button>
        </div>}
        {feedback("marks")}
        {sessionRoster.length === 0 && <p className="px-4 py-3 text-[12px] text-muted">No students were captured in this session.</p>}
        <div role="region" aria-label="Attendance marks for this session" tabIndex={0} className="table-region max-h-[560px] overflow-auto"><table className="routine-table text-[12.5px]"><thead className="sticky top-0 z-10"><tr>{["SL.", "Student ID", "Student name", "Attendance"].map((h) => <th key={h} className="px-3 py-2 text-left"><span className="micro-label">{h}</span></th>)}</tr></thead><tbody>{sessionRoster.map((student, index) => <tr key={student.id} className={index % 2 ? "bg-wash" : "bg-white"}><td className="px-3 py-2 text-center font-mono">{String(index + 1).padStart(2, "0")}</td><td className="px-3 py-2 font-mono">{student.studentCode}</td><td className="px-3 py-2 font-medium">{student.fullName}</td><td className="min-w-40 px-2 py-1.5"><select aria-label={`Attendance for ${student.fullName}`} disabled={!canTakeAttendance || pending} value={statusFor(student.id)} onChange={(event) => setStatusOverrides((current) => ({ ...current, [`${effectiveSessionId}:${student.id}`]: event.target.value as AttendanceStatus }))} className={`${control} border-[var(--color-pine)]/35`}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select></td></tr>)}</tbody></table></div>
      </>}
    </section>

    <section className="ruled rounded-lg">
      <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Student roster & semester summary</h2><p className="mt-0.5 text-[11.5px] text-muted">Removing an enrollment does not delete historical attendance.</p></header>
      <div role="region" aria-label="Student roster and semester summary" tabIndex={0} className="table-region overflow-x-auto p-4"><table className="routine-table text-[12px]"><thead><tr>{["Student", "Audience", "Midterm", "Final", "Semester", "Attendance mark"].map((h) => <th key={h} className="px-2.5 py-2 text-left"><span className="micro-label">{h}</span></th>)}</tr></thead><tbody>{roster.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted">Import a CSV or add a student to start.</td></tr> : roster.map((student) => { const summary = summaryByStudent.get(student.id); return <tr key={student.id}><td className="px-2.5 py-2"><strong>{student.fullName}</strong><div className="font-mono text-[10.5px] text-muted">{student.studentCode}</div></td><td className="px-2.5 py-2 capitalize">{student.enrollment.audienceType}</td><td className="px-2.5 py-2 font-mono">{summary?.midterm.attended ?? 0}/{summary?.midterm.total ?? 0}</td><td className="px-2.5 py-2 font-mono">{summary?.final.attended ?? 0}/{summary?.final.total ?? 0}</td><td className="px-2.5 py-2 font-mono">{summary?.semester.percentage ?? 0}%</td><td className="px-2.5 py-2 font-mono font-bold text-[var(--color-pine)]">{summary?.mark ?? 0}/{summary?.maximum ?? (selectedGroup.courseType === "sessional" ? 5 : 10)}</td></tr>; })}</tbody></table></div>
    </section>
  </div>;
}
