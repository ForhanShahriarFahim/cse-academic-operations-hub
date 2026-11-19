"use client";

import { useTermActions } from "@/components/term-write-context";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCheck, Lock, Save, Send, Trash2 } from "lucide-react";
import type { ActionResult } from "@/lib/actions";

import type { AttendanceStatus } from "@/lib/attendance";
import { fmtRange } from "@/lib/time";
import { useConfirm } from "@/components/confirm-dialog";
import { SessionHistory, StateBadge, dhakaStamp, statusWord, useReasonDialog } from "@/components/attendance-lifecycle-ui";
import { availableCommands, isEditable } from "@/lib/attendance-lifecycle";

interface Group { id: number; courseCode: string; courseTitle: string; courseType: string; audience: string; teacherIds: number[] }
interface Teacher { id: number; shortCode: string; fullName: string }
interface StudentRow {
  id: number; studentCode: string; fullName: string;
  enrollment: { audienceType: string };
}
interface SessionRow {
  id: number; classDate: string; phase: string; startMinutes: number | null; endMinutes: number | null;
  status: string; revision: number; submittedAt: string | null; submittedBy: string | null; lockedAt: string | null; lockedBy: string | null;
  voidedAt: string | null; voidedBy: string | null; voidReason: string | null; reopenReason: string | null;
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
const labels: Record<FeedbackArea, string> = { create: "Creating session…", marks: "Updating this session…", delete: "Updating sessions…" };
const sessionLabel = (session: Pick<SessionRow, "classDate" | "phase" | "startMinutes" | "endMinutes">) =>
  `${session.classDate} · ${session.phase}${session.startMinutes != null && session.endMinutes != null ? ` · ${fmtRange(session.startMinutes, session.endMinutes)}` : ""}`;

function AttendanceFeedback({ area, result, pending }: { area: FeedbackArea; result?: FeedbackResult; pending: boolean }) {
  return <div data-feedback={area} className="min-w-0 px-4 empty:p-0">
    <div id={`attendance-${area}-result`} role="status" aria-atomic="true" tabIndex={-1}
      className={pending || result ? `mb-3 rounded-md border px-3 py-2 text-sm outline-offset-2 ${result && !result.ok ? "border-[var(--color-gold)] bg-gold-tint" : "border-[var(--color-line)] bg-wash"}` : ""}>
      {pending ? labels[area] : result?.message}
    </div>
  </div>;
}

export function AttendanceManager({ selectedGroup, teachers, roster, sessions, summaries, termStart, termEnd, canManageRosters, canTakeAttendance, canReviewAttendance = false, unsubmitted = 0, rollCallHref, initialSessionId, maximum }: {
  selectedGroup: Group;
  teachers: Teacher[];
  roster: StudentRow[];
  sessions: SessionRow[];
  summaries: SummaryRow[];
  termStart: string;
  termEnd: string;
  canManageRosters: boolean;
  canTakeAttendance: boolean;
  canReviewAttendance?: boolean;
  unsubmitted?: number;
  rollCallHref?: string;
  initialSessionId?: number;
  maximum: number;
}) {
  const { createAttendanceSessionAction, deleteAttendanceSessionAction, saveAttendanceAction, changeAttendanceSessionAction, lockSubmittedAttendanceAction } = useTermActions();
  const [ask, confirmDialog] = useConfirm();
  const [askReason, reasonDialog] = useReasonDialog();
  const reasonDrafts = useRef<Record<string, string>>({});
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
  const roles = { taker: canTakeAttendance, reviewer: canReviewAttendance };
  const commands = activeSession ? availableCommands(activeSession.status, roles) : [];
  const canSave = !!activeSession && isEditable(activeSession.status) && commands.includes("save");
  const submitted = sessions.filter((session) => session.status === "submitted");

  function clearOverrides(sessionId: number, studentIds: number[]) {
    setStatusOverrides(current => {
      const next = { ...current };
      for (const studentId of studentIds) delete next[`${sessionId}:${studentId}`];
      return next;
    });
  }

  function saveMarks(command: "save" | "submit") {
    if (!activeSession) return;
    const session = activeSession;
    const values = sessionRoster.map(student => ({ studentId: student.id, status: statusFor(student.id) }));
    run("marks", () => command === "save" ? saveAttendanceAction(session.id, values, session.revision)
      : changeAttendanceSessionAction(session.id, { command, revision: session.revision, values }), () => clearOverrides(session.id, values.map(value => value.studentId)));
  }

  const REASON_COPY: Record<"reopen" | "lock" | "void" | "restore", { title: string; body: string; label: string; confirmLabel: string; tone?: "danger" }> = {
    reopen: { title: "Reopen this session for correction?", body: "The submitted roll-call is kept in the session history. The session becomes editable and must be submitted again.", label: "Reason for correction", confirmLabel: "Reopen session" },
    lock: { title: "Lock this session?", body: "Only an attendance reviewer can reopen or void a locked session.", label: "Note", confirmLabel: "Lock session" },
    void: { title: "Void this session?", body: "The session and its marks are kept but no longer count. A new session can then be created for the same date and time.", label: "Reason for voiding", confirmLabel: "Void session", tone: "danger" },
    restore: { title: "Restore this voided session?", body: "It returns as reopened and must be submitted again. Restoring is refused if another active session uses the same date and time.", label: "Reason for restoring", confirmLabel: "Restore session" },
  };
  async function reasonCommand(command: "reopen" | "lock" | "void" | "restore") {
    if (!activeSession) return;
    const session = activeSession, key = `${session.id}:${command}`, copy = REASON_COPY[command];
    const reason = await askReason({ ...copy, title: copy.title.replace("this session", `the ${session.classDate} session`), requirement: command === "lock" ? "optional" : "required", initial: reasonDrafts.current[key] });
    if (reason === null) return;
    reasonDrafts.current[key] = reason;
    run("marks", () => changeAttendanceSessionAction(session.id, { command, revision: session.revision, reason }), () => { delete reasonDrafts.current[key]; });
  }

  async function deleteDraft() {
    if (!activeSession) return;
    const session = activeSession;
    if (!await ask({ title: `Delete the ${session.classDate} draft?`, body: "This draft has never been submitted. The session and every mark in it will be removed; the deletion is recorded in the audit log.", confirmLabel: "Delete draft" })) return;
    run("delete", () => deleteAttendanceSessionAction(session.id, session.revision), () => {
      setActiveSessionId(initialSessionId === undefined ? undefined : 0);
      setResults(current => ({ ...current, marks: undefined }));
    });
  }

  async function lockAll() {
    const phases = (phase: string) => submitted.filter(session => session.phase === phase).length;
    const others = (["draft", "reopened", "locked", "voided"] as const).map(state => [state, sessions.filter(session => session.status === state).length] as const).filter(([, count]) => count > 0);
    const ids = submitted.map(session => session.id);
    const note = await askReason({
      title: `Lock ${ids.length} submitted session(s)?`, label: "Note", confirmLabel: `Lock ${ids.length} session(s)`, requirement: "optional",
      body: <ul className="list-disc pl-5"><li><strong>{ids.length} submitted</strong> will be locked: {phases("midterm")} midterm, {phases("final")} final.</li>
        <li>Not affected: {others.length ? others.map(([state, count]) => `${count} ${state}`).join(", ") : "no other sessions"}.</li></ul>,
    });
    if (note === null) return;
    run("delete", () => lockSubmittedAttendanceAction(selectedGroup.id, ids, note || null));
  }

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

  return <div ref={manager} className="space-y-4">{confirmDialog}{reasonDialog}
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
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-line-soft)] px-4 py-3">
        <div className="min-w-0"><h2 id="roll-call-heading" className="font-display text-[15px] font-semibold">Take attendance</h2><p className="mt-0.5 text-[11.5px] text-muted">Late counts as attended; excused is excluded from the denominator. Only students captured when this session was created can be marked. A submitted roll-call is read-only until it is reopened with a reason.</p></div>
        {canReviewAttendance && submitted.length > 0 && <button type="button" disabled={pending} onClick={lockAll} className="min-h-9 rounded-md border border-[var(--color-pine)] px-3 text-[12px] font-semibold text-[var(--color-pine)]">Lock all submitted ({submitted.length})</button>}
      </header>
      {sessions.length > 0 && <ul aria-label="Dated sessions" className="flex flex-wrap gap-1.5 border-b border-[var(--color-line-soft)] px-4 py-2.5">{sessions.map((session) => <li key={session.id}><button type="button" disabled={pending} aria-pressed={session.id === effectiveSessionId} onClick={() => selectSession(session.id)} className={`flex min-h-11 flex-col items-start rounded-md border px-2.5 py-1 text-left text-[11px] ${session.id === effectiveSessionId ? "border-[var(--color-pine)] bg-wash shadow-[inset_0_-3px_0_var(--color-pine)]" : "border-[var(--color-line)] bg-white"}`}>
        <span className={`font-semibold ${session.status === "voided" ? "line-through" : ""}`}>{sessionLabel(session)}</span><StateBadge state={session.status} />
      </button></li>)}</ul>}
      {feedback("delete")}
      {!activeSession ? <p className="p-8 text-center text-[12px] text-muted">{sessions.length ? "Choose a dated session to see its attendance." : "Create a session to take attendance."}</p> : <>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-[var(--color-line-soft)] px-4 py-3">
          <div className="min-w-0 flex-[1_1_18rem]">
            <StateBadge state={activeSession.status} />
            <p className="text-[13px]"><strong>{activeSession.classDate}</strong> · {activeSession.phase}{activeSession.startMinutes != null && activeSession.endMinutes != null ? ` · ${fmtRange(activeSession.startMinutes, activeSession.endMinutes)}` : ""}</p>
            <div className="mt-0.5 space-y-0.5 text-[11.5px] text-muted">
              {activeSession.status === "draft" && <p>Not submitted yet.</p>}
              {activeSession.submittedAt && activeSession.status !== "draft" && <p>Last submitted by {activeSession.submittedBy} · {dhakaStamp(activeSession.submittedAt)}</p>}
              {activeSession.lockedAt && <p>Locked by {activeSession.lockedBy} · {dhakaStamp(activeSession.lockedAt)}</p>}
              {activeSession.voidedAt && <p>Voided by {activeSession.voidedBy} · {dhakaStamp(activeSession.voidedAt)}</p>}
            </div>
          </div>
          {commands.length > 0 && <div className="flex flex-wrap items-center gap-2">
            {canSave && <button type="button" disabled={pending || sessionRoster.length === 0} onClick={() => setStatusOverrides((current) => ({ ...current, ...Object.fromEntries(sessionRoster.map((student) => [`${effectiveSessionId}:${student.id}`, "present" as AttendanceStatus])) }))} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--color-pine)] px-2.5 text-[11.5px] font-semibold text-[var(--color-pine)]"><CheckCheck size={12} aria-hidden="true" />Mark all present</button>}
            {canSave && <button type="button" disabled={pending || sessionRoster.length === 0} onClick={() => saveMarks("save")} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--color-pine)] bg-white px-3 text-[11.5px] font-semibold text-[var(--color-pine)]"><Save size={12} aria-hidden="true" />{activeSession.status === "reopened" ? "Save correction" : "Save draft"}</button>}
            {commands.includes("submit") && <button type="button" disabled={pending || sessionRoster.length === 0} onClick={() => saveMarks("submit")} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-[var(--color-pine)] px-3 text-[11.5px] font-semibold text-white"><Send size={12} aria-hidden="true" />{activeSession.status === "reopened" ? "Resubmit" : "Submit roll-call"}</button>}
            {commands.includes("reopen") && <button type="button" disabled={pending} onClick={() => reasonCommand("reopen")} className="min-h-9 rounded-md border border-[var(--color-pine)] bg-white px-3 text-[11.5px] font-semibold text-[var(--color-pine)]">Reopen for correction</button>}
            {commands.includes("lock") && <button type="button" disabled={pending} onClick={() => reasonCommand("lock")} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-[var(--color-pine)] px-3 text-[11.5px] font-semibold text-white"><Lock size={12} aria-hidden="true" />Lock</button>}
            {commands.includes("restore") && <button type="button" disabled={pending} onClick={() => reasonCommand("restore")} className="min-h-9 rounded-md border border-[var(--color-pine)] bg-white px-3 text-[11.5px] font-semibold text-[var(--color-pine)]">Restore</button>}
            {commands.includes("void") && <button type="button" disabled={pending} onClick={() => reasonCommand("void")} className="min-h-9 rounded-md border border-[var(--color-clay)] bg-white px-3 text-[11.5px] font-semibold text-[var(--color-clay)]">Void session</button>}
            {commands.includes("delete") && <button type="button" disabled={pending} onClick={deleteDraft} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--color-clay)] bg-white px-3 text-[11.5px] font-semibold text-[var(--color-clay)]"><Trash2 size={12} aria-hidden="true" />Delete draft</button>}
          </div>}
        </div>
        {activeSession.status === "reopened" && activeSession.reopenReason && <p className="mx-4 mt-3 border-l-[3px] border-[var(--color-gold)] bg-gold-tint px-3 py-2 text-[12px]"><strong>Reason for correction:</strong> {activeSession.reopenReason}</p>}
        {activeSession.status === "voided" && activeSession.voidReason && <p className="mx-4 mt-3 border-l-[3px] border-[var(--color-clay)] bg-wash px-3 py-2 text-[12px]"><strong>Reason voided:</strong> {activeSession.voidReason} <span className="text-muted">This session is kept but does not count.</span></p>}
        {activeSession.status === "locked" && !canReviewAttendance && <p className="mx-4 mt-3 border-l-[3px] border-[var(--color-pine)] bg-wash px-3 py-2 text-[12px]">Only an attendance reviewer can reopen or void a locked session.</p>}
        <div className="pt-3">{feedback("marks")}</div>
        {sessionRoster.length === 0 && <p className="px-4 py-3 text-[12px] text-muted">No students were captured in this session.</p>}
        <div role="region" aria-label="Attendance marks for this session" tabIndex={0} className="table-region max-h-[560px] overflow-auto"><table className="routine-table text-[12.5px]"><thead className="sticky top-0 z-10"><tr>{["SL.", "Student ID", "Student name", "Attendance"].map((h) => <th key={h} className="px-3 py-2 text-left"><span className="micro-label">{h}</span></th>)}</tr></thead><tbody>{sessionRoster.map((student, index) => {
          const stored = activeSession.records.find((record) => record.studentId === student.id)?.status ?? "";
          const shown = statusFor(student.id);
          const changed = canSave && shown !== stored;
          return <tr key={student.id} className={changed ? "bg-gold-tint" : index % 2 ? "bg-wash" : "bg-white"}><td className="px-3 py-2 text-center font-mono">{String(index + 1).padStart(2, "0")}</td><td className="px-3 py-2 font-mono">{student.studentCode}</td><td className="px-3 py-2 font-medium">{student.fullName}{changed && <span className="ml-1 text-[11px] font-normal text-muted">· unsaved, was {statusWord(stored)}</span>}</td><td className="min-w-40 px-2 py-1.5">{canSave
            ? <select aria-label={`Attendance for ${student.fullName}${changed ? `, changed from ${statusWord(stored)}` : ""}`} disabled={pending} value={shown} onChange={(event) => setStatusOverrides((current) => ({ ...current, [`${effectiveSessionId}:${student.id}`]: event.target.value as AttendanceStatus }))} className={`${control} border-[var(--color-pine)]/35`}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select>
            : <span className="px-1 font-semibold">{statusWord(stored)}</span>}</td></tr>;
        })}</tbody></table></div>
        <SessionHistory sessionId={activeSession.id} revision={activeSession.revision} />
      </>}
    </section>

    <section className="ruled rounded-lg">
      <header className="border-b border-[var(--color-line-soft)] px-4 py-3"><h2 className="font-display text-[15px] font-semibold">Student roster & semester summary</h2><p className="mt-0.5 text-[11.5px] text-muted">Removing an enrollment does not delete historical attendance. Every session except voided ones counts here.{unsubmitted > 0 ? ` ${unsubmitted} session(s) not yet submitted.` : ""}</p></header>
      <div role="region" aria-label="Student roster and semester summary" tabIndex={0} className="table-region overflow-x-auto p-4"><table className="routine-table text-[12px]"><thead><tr>{["Student", "Audience", "Midterm", "Final", "Semester", "Attendance mark"].map((h) => <th key={h} className="px-2.5 py-2 text-left"><span className="micro-label">{h}</span></th>)}</tr></thead><tbody>{roster.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted">Import a CSV or add a student to start.</td></tr> : roster.map((student) => { const summary = summaryByStudent.get(student.id); return <tr key={student.id}><td className="px-2.5 py-2"><strong>{student.fullName}</strong><div className="font-mono text-[10.5px] text-muted">{student.studentCode}</div></td><td className="px-2.5 py-2 capitalize">{student.enrollment.audienceType}</td><td className="px-2.5 py-2 font-mono">{summary?.midterm.attended ?? 0}/{summary?.midterm.total ?? 0}</td><td className="px-2.5 py-2 font-mono">{summary?.final.attended ?? 0}/{summary?.final.total ?? 0}</td><td className="px-2.5 py-2 font-mono">{summary?.semester.percentage ?? 0}%</td><td className="px-2.5 py-2 font-mono font-bold text-[var(--color-pine)]">{summary?.mark ?? 0}/{summary?.maximum ?? (selectedGroup.courseType === "sessional" ? 5 : 10)}</td></tr>; })}</tbody></table></div>
    </section>
  </div>;
}
